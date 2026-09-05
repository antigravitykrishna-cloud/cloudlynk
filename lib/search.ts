import { supabase, Database } from './supabase';
import { ChannelPost } from './posts';

export type SearchChannel = Database['public']['Tables']['channels']['Row'];

export type SearchResults = {
  channels: SearchChannel[];
  movies: ChannelPost[];
  series: ChannelPost[];
  shorts: ChannelPost[];
};

const EMPTY_RESULTS: SearchResults = { channels: [], movies: [], series: [], shorts: [] };

export const SearchService = {
  async searchAll(query: string, limit = 20): Promise<SearchResults> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return EMPTY_RESULTS;

    const pattern = `%${trimmed}%`;

    const [channelsRes, postsRes] = await Promise.all([
      supabase
        .from('channels')
        .select('*')
        .eq('status', 'active')
        .eq('is_public', true)
        .or(`name.ilike.${pattern},description.ilike.${pattern}`)
        .limit(limit),

      supabase
        .from('channel_posts')
        .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url), channel:channels!channel_posts_channel_id_fkey(name)')
        .eq('status', 'approved')
        .eq('visibility', 'public')
        .or(`title.ilike.${pattern},body.ilike.${pattern}`)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    const channels = channelsRes.data ?? [];
    const posts = (postsRes.data ?? []) as unknown as ChannelPost[];

    return {
      channels,
      movies: posts.filter(p => p.content_type === 'movie'),
      series: posts.filter(p => p.content_type === 'series'),
      shorts: posts.filter(p => p.content_type === 'short'),
    };
  },
};
