import { supabase } from './supabase';
import { PostService } from './posts';

export type FeedPost = {
  id: string;
  channel_id: string;
  channel_name: string;
  author_id: string;
  author_name: string;
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  created_at: string;
};

export const FeedService = {
  /**
   * Returns the most recent approved posts from all channels
   * the user is a member of — used for the home screen feed.
   */
  async getHomeFeed(userId: string, limit = 6): Promise<FeedPost[]> {
    // Get channels the user belongs to
    const { data: memberships, error: mErr } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', userId);

    if (mErr) throw mErr;
    if (!memberships || memberships.length === 0) return [];

    const channelIds = memberships.map(m => m.channel_id);

    // Get recent approved posts from those channels
    const { data: posts, error: pErr } = await supabase
      .from('channel_posts')
      .select(`
        id, channel_id, author_id, title, body,
        media_url, media_type, created_at,
        author:profiles!channel_posts_author_id_fkey(full_name),
        channel:channels(name)
      `)
      .in('channel_id', channelIds)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (pErr) throw pErr;

    return (posts ?? []).map((p: any) => ({
      id: p.id,
      channel_id: p.channel_id,
      channel_name: p.channel?.name ?? 'Unknown',
      author_id: p.author_id,
      author_name: p.author?.full_name ?? 'Unknown',
      title: p.title,
      body: p.body,
      media_url: p.media_url,
      media_type: p.media_type,
      created_at: p.created_at,
    }));
  },

  getMediaUrl(storagePath: string): string {
    return PostService.getMediaPublicUrl(storagePath);
  },

  /**
   * Returns a count of pending admin actions — used to show
   * the admin badge on the home screen header.
   */
  async getAdminPendingCount(): Promise<number> {
    const [{ count: channels }, { count: posts }] = await Promise.all([
      supabase
        .from('channels')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('channel_posts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]);
    return (channels ?? 0) + (posts ?? 0);
  },
};
