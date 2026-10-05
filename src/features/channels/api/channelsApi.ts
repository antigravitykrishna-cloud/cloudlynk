import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

// guards-allow-select-star
// Guests reach listDiscover() and get(id, { signedIn: false }); both name their columns
// (LISTED_CHANNEL_COLUMNS). The select('*') reads below run only for signed-in callers. See
// scripts/guards.mjs check 2 for why select('*') fails on a guest-reachable path.

export type Channel = Tables<'channels'>;
/** A channel the person belongs to, with their role in it. */
export type JoinedChannel = Channel & { myRole: string };

/** How the Discover list is ordered. */
export type DiscoverSort = 'top_rated' | 'trending' | 'latest';

/**
 * The columns the channel lists show: a subset guests may read. Asking for a column a role cannot
 * read fails the whole request (it is not returned as null), so lists never use select('*').
 */
const LISTED_CHANNEL_COLUMNS =
  'id, owner_id, name, description, category, is_public, is_official, ' +
  'status, member_count, post_count, created_at';

/** How long a new channel waits for admin approval before it lapses. */
const APPROVAL_WINDOW_DAYS = 7;

export const channelsApi = {
  // ── Reads ────────────────────────────────────────────────────────────────

  /** One channel. Signed-out visitors get the listed columns only. */
  async get(channelId: string, { signedIn }: { signedIn: boolean }): Promise<Channel | null> {
    const { data, error } = await supabase
      .from('channels')
      .select(signedIn ? '*' : LISTED_CHANNEL_COLUMNS)
      .eq('id', channelId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as Channel | null;
  },

  /** Public channels for the Discover list (active, plus pending ones awaiting approval). */
  async listDiscover(sort: DiscoverSort): Promise<Channel[]> {
    let query = supabase
      .from('channels')
      .select(LISTED_CHANNEL_COLUMNS)
      .eq('is_public', true)
      .in('status', ['active', 'pending']);

    if (sort === 'top_rated') {
      query = query
        .order('member_count', { ascending: false })
        .order('post_count', { ascending: false });
    } else if (sort === 'trending') {
      query = query
        .order('post_count', { ascending: false })
        .order('member_count', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query.limit(30);
    if (error) throw error;
    // Every field the lists render is among the selected columns.
    return (data ?? []) as unknown as Channel[];
  },

  /** Channels the person joined (or owns), newest first. */
  async listJoined(userId: string): Promise<JoinedChannel[]> {
    const { data, error } = await supabase
      .from('channel_members')
      .select('role, channels(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false, referencedTable: 'channels' });
    if (error) throw error;
    return (data ?? [])
      .filter(row => row.channels)
      .map(row => ({ ...(row.channels as Channel), myRole: row.role }));
  },

  /** Ids of the channels the person belongs to, for "Joined" / "Join" buttons. */
  async listJoinedIds(userId: string): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', userId);
    if (error) throw error;
    return new Set((data ?? []).map(row => row.channel_id));
  },

  async listOwned(userId: string): Promise<Channel[]> {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async isMember(channelId: string, userId: string): Promise<boolean> {
    const { data } = await supabase
      .from('channel_members')
      .select('role')
      .eq('channel_id', channelId)
      .eq('user_id', userId)
      .maybeSingle();
    return !!data;
  },

  // ── Writes ───────────────────────────────────────────────────────────────

  /** Creates a channel awaiting admin approval and makes the creator its owner. */
  async create(input: {
    ownerId: string;
    name: string;
    description: string;
    isPublic: boolean;
    link?: string;
    category?: string;
  }): Promise<Channel> {
    const approvalExpiresAt = new Date();
    approvalExpiresAt.setDate(approvalExpiresAt.getDate() + APPROVAL_WINDOW_DAYS);

    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        owner_id: input.ownerId,
        name: input.name,
        description: input.description,
        is_public: input.isPublic,
        status: 'pending',
        approval_expires_at: approvalExpiresAt.toISOString(),
        link: input.link?.trim() || null,
        category: input.category ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    await supabase
      .from('channel_members')
      .insert({ channel_id: channel.id, user_id: input.ownerId, role: 'owner' });

    return channel;
  },

  /**
   * Joins a channel (join_channel). The server decides who may: guests cannot, a hidden channel
   * needs a plan, a public one does not.
   */
  async join(channelId: string): Promise<void> {
    const { error } = await supabase.rpc('join_channel', { p_channel_id: channelId });
    if (error) throw error;
  },

  async leave(channelId: string): Promise<void> {
    const { error } = await supabase.rpc('leave_channel', { p_channel_id: channelId });
    if (error) throw error;
  },

  /** Renames a channel or changes its description. Owner or admin only (update_channel). */
  async update(channelId: string, name: string, description: string): Promise<void> {
    const { error } = await supabase.rpc('update_channel', {
      p_channel_id: channelId,
      p_name: name,
      p_description: description,
    });
    if (error) throw error;
  },

  /** Deletes a channel and everything in it. Owner or admin only (delete_channel). */
  async remove(channelId: string): Promise<void> {
    const { error } = await supabase.rpc('delete_channel', { p_channel_id: channelId });
    if (error) throw error;
  },
};
