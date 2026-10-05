import { supabase } from '@/lib/supabase';
import { dedupeById, exploreOrderColumn, mergeFeed } from './grouping';
import {
  ChannelPost,
  ExploreFilter,
  GUEST_POST_COLUMNS,
  GuestChannelPost,
  POST_WITH_AUTHOR,
} from './types';

// guards-allow-select-star
// getExplorePosts and getChannelPosts take a userId and run authenticated. The guest paths
// (getGuestExplorePosts, getGuestChannelPosts) name their columns via GUEST_POST_COLUMNS.
// See scripts/guards.mjs check 2 for why select('*') is unsafe on a guest-reachable path.

async function joinedChannelIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(m => m.channel_id);
}

/**
 * A channel's approved posts for a guest, named columns only (guests cannot read video_url).
 * Limited to public, active channels by RLS. For listing only.
 */
export async function getGuestChannelPosts(channelId: string): Promise<GuestChannelPost[]> {
  const { data, error } = await supabase
    .from('channel_posts')
    .select(GUEST_POST_COLUMNS)
    .eq('channel_id', channelId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as GuestChannelPost[];
}

/**
 * A channel's premium titles as metadata only (premium_preview view, no video column), so people
 * without a plan can see what the channel has.
 */
export async function getChannelPremiumPreviews(channelId: string): Promise<GuestChannelPost[]> {
  const { data, error } = await supabase
    .from('premium_preview')
    .select(GUEST_POST_COLUMNS)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as GuestChannelPost[];
}

/**
 * Feed: newest approved posts from the channels this user joined ([] if none). Listing only, no
 * video_url. Premium titles come from premium_preview for people without a plan, so the Feed
 * shows everything and locked titles lead to the plans.
 */
export async function getJoinedFeedPosts(userId: string, limit = 60): Promise<GuestChannelPost[]> {
  const channelIds = await joinedChannelIds(userId);
  if (channelIds.length === 0) return [];

  const [posts, previews] = await Promise.all([
    supabase
      .from('channel_posts')
      .select(GUEST_POST_COLUMNS)
      .in('channel_id', channelIds)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('premium_preview')
      .select(GUEST_POST_COLUMNS)
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);
  if (posts.error) throw posts.error;
  // A missing preview list only costs the locked titles; do not fail the Feed.
  return mergeFeed(
    (posts.data ?? []) as unknown as GuestChannelPost[],
    (previews.data ?? []) as unknown as GuestChannelPost[],
    limit,
  );
}

/** A channel's approved posts, plus the caller's own pending and rejected ones first. */
export async function getChannelPosts(channelId: string, userId: string): Promise<ChannelPost[]> {
  const { data: approved, error: e1 } = await supabase
    .from('channel_posts')
    .select(POST_WITH_AUTHOR)
    .eq('channel_id', channelId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    // Newest 300 -- a channel page is rows of recent titles, and an
    // unbounded read grows with the channel forever.
    .limit(300);
  if (e1) throw e1;

  const { data: mine, error: e2 } = await supabase
    .from('channel_posts')
    .select(POST_WITH_AUTHOR)
    .eq('channel_id', channelId)
    .eq('author_id', userId)
    .in('status', ['pending', 'rejected'])
    .order('created_at', { ascending: false });
  if (e2) throw e2;

  return [...(mine ?? []), ...(approved ?? [])] as ChannelPost[];
}

export async function getGuestExplorePosts(filter?: ExploreFilter): Promise<GuestChannelPost[]> {
  // No channel filter needed: channel_posts_select_anon already restricts to
  // approved posts in public, active channels, so RLS is doing the work the
  // authenticated path does with an explicit .in() list.
  const { data, error } = await supabase
    .from('channel_posts')
    .select(
      `${GUEST_POST_COLUMNS}, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)`,
    )
    .eq('status', 'approved')
    .order(exploreOrderColumn(filter), { ascending: false })
    .limit(300);
  if (error) throw error;

  return (data ?? []).filter(
    p => p.content_type !== 'post' || p.thumbnail_url,
  ) as unknown as GuestChannelPost[];
}

export async function getExplorePosts(
  userId: string,
  filter?: ExploreFilter,
): Promise<ChannelPost[]> {
  // RLS decides what comes back (each post's access level against the caller's plan), so this
  // asks for everything reachable.

  // Channels the user has explicitly joined — always full access regardless of plan
  const myChannelIds = await joinedChannelIds(userId);

  const { data: publicChannels, error: cErr } = await supabase
    .from('channels')
    .select('id')
    .eq('is_public', true)
    .eq('status', 'active');
  if (cErr) throw cErr;

  // Public channels the user has NOT joined
  const myChannelSet = new Set(myChannelIds);
  const publicOnlyIds = (publicChannels ?? []).map(c => c.id).filter(id => !myChannelSet.has(id));

  const orderCol = exploreOrderColumn(filter);
  const results: ChannelPost[] = [];

  // 1. Content from joined channels
  if (myChannelIds.length > 0) {
    const { data, error } = await supabase
      .from('channel_posts')
      .select(POST_WITH_AUTHOR)
      .in('channel_id', myChannelIds)
      .eq('status', 'approved')
      .order(orderCol, { ascending: false })
      .limit(150);
    if (error) throw error;
    results.push(...((data ?? []) as ChannelPost[]));
  }

  // 2. Content from public channels the user hasn't joined — RLS silently
  //    filters out any post whose access_level='premium' unless this
  //    user's plan_status is active/lifetime. Free users simply get back
  //    fewer rows; no client-side branching needed.
  if (publicOnlyIds.length > 0) {
    const { data, error } = await supabase
      .from('channel_posts')
      .select(POST_WITH_AUTHOR)
      .in('channel_id', publicOnlyIds)
      .eq('status', 'approved')
      .order(orderCol, { ascending: false })
      .limit(100);
    if (error) throw error;
    results.push(...((data ?? []) as ChannelPost[]));
  }

  // 3. Locked premium titles for browsing (premium_preview has no video columns). Added last so a
  // post the viewer can actually play (from steps 1-2) wins the dedup below. Non-fatal: without
  // previews the viewer still gets their playable content.
  try {
    const { data: previews } = await supabase
      .from('premium_preview')
      .select('*')
      .order(orderCol, { ascending: false })
      .limit(100);
    // Preview rows have no video columns; the UI sends a tap on them to the plans.
    results.push(...((previews ?? []) as unknown as ChannelPost[]));
  } catch (err) {
    if (__DEV__) console.warn('premium_preview unavailable:', err);
  }

  // A joined channel might also be public.
  return dedupeById(results).filter(
    p => p.content_type !== 'post' || p.video_url || p.thumbnail_url || p.media_url,
  );
}

export async function recordView(postId: string) {
  try {
    await supabase.rpc('record_post_view', { p_post_id: postId });
  } catch {}
}
