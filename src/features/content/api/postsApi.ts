import { supabase } from '@/lib/supabase';
import { publicMedia } from '@/lib/publicMedia';
import { withTimeout } from '@/utils/async';
import {
  defaultAccessLevel,
  type AccessLevel,
  type ChannelPost,
  type ContentType,
  type ListedPost,
  type PostStatus,
} from '@/features/content/model';

// guards-allow-select-star
// The guest-reachable reads name their columns (LISTED_POST_COLUMNS); `anon` may read only some
// columns, and asking for one it cannot read fails the whole request. The select('*') reads below
// run only for signed-in callers. See scripts/guards.mjs check 2.

/** Exactly the channel_posts columns guests may read (v61). No video or moderation columns. */
const LISTED_POST_COLUMNS =
  'id, channel_id, author_id, title, body, content_type, access_level, genre, ' +
  'duration_min, release_year, season_number, episode_number, episode_title, ' +
  'series_id, tags, media_type, thumbnail_url, is_short, view_count, status, created_at';

const AUTHOR = 'author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)';

/** How the Explore tab orders titles. */
export type ExploreSort = 'all' | 'popular' | 'most_watched' | 'latest' | 'most_searched';

/** A post as the uploader sees it in My Videos (get_my_channel_posts). */
export type MyPost = {
  id: string;
  channel_id: string;
  channel_name: string | null;
  title: string | null;
  content_type: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  status: PostStatus;
  rejection_note: string | null;
  created_at: string;
  approved_at: string | null;
};

/** Everything needed to publish a post whose video is already on Cloudflare Stream. */
export type NewPost = {
  channelId: string;
  authorId: string;
  title: string;
  body?: string;
  contentType: ContentType;
  /** Defaults to defaultAccessLevel(contentType). */
  accessLevel?: AccessLevel;
  genre?: string;
  durationMin?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  /** Defaults to the current year. */
  releaseYear?: number;
  /** A local image, uploaded to public media before the post is created. */
  thumbnailUri?: string;
  /** The Cloudflare Stream uid. Only a plain post may have no video. */
  streamVideoUid?: string;
  seriesId?: string;
  /** Saved but not submitted for review. */
  saveAsDraft?: boolean;
};

function sortColumn(sort: ExploreSort | undefined) {
  return sort === 'popular' || sort === 'most_watched' ? 'view_count' : 'created_at';
}

/** Merges two lists by id, keeping the first copy of each post, newest first. */
function mergeNewestFirst<T extends { id: string; created_at: string }>(first: T[], second: T[]) {
  const seen = new Set(first.map(p => p.id));
  return [...first, ...second.filter(p => !seen.has(p.id))].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  );
}

export const postsApi = {
  // ── Listings anyone can see ──────────────────────────────────────────────

  /** A channel's approved posts, as listings. RLS limits guests to public, active channels. */
  async listChannelPostsForGuest(channelId: string): Promise<ListedPost[]> {
    const { data, error } = await supabase
      .from('channel_posts')
      .select(LISTED_POST_COLUMNS)
      .eq('channel_id', channelId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ListedPost[];
  },

  /**
   * A channel's premium titles as metadata only (the premium_preview view has no video column), so
   * people without a plan can see what the channel offers.
   */
  async listPremiumPreviews(channelId: string): Promise<ListedPost[]> {
    const { data, error } = await supabase
      .from('premium_preview')
      .select(LISTED_POST_COLUMNS)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ListedPost[];
  },

  /**
   * Explore for a signed-out visitor. RLS (channel_posts_select_anon) already limits this to
   * approved posts in public, active channels.
   */
  async listExploreForGuest(sort?: ExploreSort): Promise<ListedPost[]> {
    const { data, error } = await supabase
      .from('channel_posts')
      .select(`${LISTED_POST_COLUMNS}, ${AUTHOR}`)
      .eq('status', 'approved')
      .order(sortColumn(sort), { ascending: false })
      .limit(300);
    if (error) throw error;
    const posts = (data ?? []) as unknown as ListedPost[];
    // A text-only post has nothing to show on a poster shelf.
    return posts.filter(p => p.content_type !== 'post' || p.thumbnail_url);
  },

  // ── Signed-in listings ───────────────────────────────────────────────────

  /**
   * Feed: the newest approved posts from the channels this person joined ([] if none). Premium
   * titles come from premium_preview for people without a plan, so the Feed shows everything and a
   * locked title leads to the plans.
   */
  async listFeed(userId: string, limit = 60): Promise<ListedPost[]> {
    const channelIds = await joinedChannelIds(userId);
    if (channelIds.length === 0) return [];

    const [posts, previews] = await Promise.all([
      supabase
        .from('channel_posts')
        .select(LISTED_POST_COLUMNS)
        .in('channel_id', channelIds)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('premium_preview')
        .select(LISTED_POST_COLUMNS)
        .in('channel_id', channelIds)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);
    if (posts.error) throw posts.error;
    // A failed preview read only costs the locked titles; do not fail the Feed for it.
    return mergeNewestFirst(
      (posts.data ?? []) as unknown as ListedPost[],
      (previews.data ?? []) as unknown as ListedPost[],
    ).slice(0, limit);
  },

  /**
   * A channel's approved posts (newest 300) plus the caller's own pending and rejected ones, so an
   * uploader sees what is waiting for review.
   */
  async listChannelPosts(channelId: string, userId: string): Promise<ChannelPost[]> {
    const [approved, mine] = await Promise.all([
      supabase
        .from('channel_posts')
        .select(`*, ${AUTHOR}`)
        .eq('channel_id', channelId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('channel_posts')
        .select(`*, ${AUTHOR}`)
        .eq('channel_id', channelId)
        .eq('author_id', userId)
        .in('status', ['pending', 'rejected'])
        .order('created_at', { ascending: false }),
    ]);
    if (approved.error) throw approved.error;
    if (mine.error) throw mine.error;
    return [...(mine.data ?? []), ...(approved.data ?? [])] as ChannelPost[];
  },

  /**
   * Explore for a signed-in person: posts from joined channels, then from other public channels,
   * then locked premium previews. RLS decides what is playable: a premium post comes back only for
   * an active plan, so people without one simply get fewer playable rows.
   */
  async listExplore(userId: string, sort?: ExploreSort): Promise<ChannelPost[]> {
    const order = sortColumn(sort);
    const [joinedIds, publicIds] = await Promise.all([
      joinedChannelIds(userId),
      activePublicChannelIds(),
    ]);
    const joined = new Set(joinedIds);
    const otherPublicIds = publicIds.filter(id => !joined.has(id));

    const postsIn = async (channelIds: string[], limit: number) => {
      if (channelIds.length === 0) return [];
      const { data, error } = await supabase
        .from('channel_posts')
        .select(`*, ${AUTHOR}`)
        .in('channel_id', channelIds)
        .eq('status', 'approved')
        .order(order, { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as ChannelPost[];
    };

    const fromJoined = await postsIn(joinedIds, 150);
    const fromPublic = await postsIn(otherPublicIds, 100);

    // Added last, so a post the viewer can actually play (above) wins the de-duplication. Not
    // fatal: without previews the viewer still gets everything playable.
    let previews: ChannelPost[] = [];
    try {
      const { data } = await supabase
        .from('premium_preview')
        .select('*')
        .order(order, { ascending: false })
        .limit(100);
      previews = (data ?? []) as unknown as ChannelPost[];
    } catch (err) {
      if (__DEV__) console.warn('premium_preview unavailable:', err);
    }

    const seen = new Set<string>();
    return [...fromJoined, ...fromPublic, ...previews].filter(post => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      // A text-only post with no media has nothing to show on a poster shelf.
      return (
        post.content_type !== 'post' || !!(post.video_url || post.thumbnail_url || post.media_url)
      );
    });
  },

  /** The caller's own submissions for My Videos, optionally one status only. */
  async listMine(status?: PostStatus): Promise<MyPost[]> {
    const { data, error } = await supabase.rpc('get_my_channel_posts', { p_status: status });
    if (error) throw error;
    return (data ?? []) as MyPost[];
  },

  // ── Writes ───────────────────────────────────────────────────────────────

  /** Counts a view (record_post_view). Best effort: a lost view is not worth an error. */
  async recordView(postId: string): Promise<void> {
    try {
      await supabase.rpc('record_post_view', { p_post_id: postId });
    } catch {
      // ignored
    }
  },

  /** Deletes a post. Row-level security allows only its author, the channel owner or an admin. */
  async remove(postId: string): Promise<void> {
    const { error } = await supabase.from('channel_posts').delete().eq('id', postId);
    if (error) throw error;
  },

  /** Creates a post: pending review, or a draft. */
  async create(post: NewPost): Promise<ChannelPost> {
    const thumbnailPath = post.thumbnailUri
      ? await publicMedia.upload(post.authorId, post.thumbnailUri, 'image')
      : null;

    // Plain columns and no embedded author: the caller refetches the list afterwards anyway, and
    // the timeout means a stalled request ends in a clear error rather than a spinner.
    const { data, error } = await withTimeout(
      supabase
        .from('channel_posts')
        .insert({
          channel_id: post.channelId,
          author_id: post.authorId,
          title: post.title.trim() || null,
          body: (post.body ?? '').trim(),
          media_url: null,
          media_type: null,
          thumbnail_url: thumbnailPath,
          content_type: post.contentType,
          genre: post.genre || null,
          duration_min: post.durationMin || null,
          season_number: post.seasonNumber || null,
          episode_number: post.episodeNumber || null,
          episode_title: post.episodeTitle || null,
          release_year: post.releaseYear || new Date().getFullYear(),
          video_url: post.streamVideoUid ?? null,
          submitted_at: post.saveAsDraft ? null : new Date().toISOString(),
          series_id: post.seriesId ?? null,
          access_level: post.accessLevel ?? defaultAccessLevel(post.contentType),
          status: post.saveAsDraft ? 'draft' : 'pending',
        })
        .select('*')
        .single(),
      30_000,
      'Saving your content timed out. Please check your connection and try again.',
    );
    if (error) throw error;
    return data as ChannelPost;
  },
};

async function joinedChannelIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('channel_members')
    .select('channel_id')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(row => row.channel_id);
}

async function activePublicChannelIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('channels')
    .select('id')
    .eq('is_public', true)
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []).map(row => row.id);
}
