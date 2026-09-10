import { supabase, Database } from './supabase';
import { ChannelPost, GUEST_POST_COLUMNS } from './posts';

// Only the columns the search query actually selects, which is deliberately
// the anon-readable subset. Using the full Row here would claim fields the
// query never asks for.
export type SearchChannel = Pick<
  Database['public']['Tables']['channels']['Row'],
  'id' | 'owner_id' | 'name' | 'description' | 'category' | 'is_public'
  | 'is_official' | 'status' | 'member_count' | 'post_count' | 'created_at'
>;

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
        // Named columns, not '*': anon is granted a subset of channels, and
        // PostgREST fails the whole request for a column the caller cannot
        // read rather than omitting it. Search is meant to work signed-out.
        .select('id, owner_id, name, description, category, is_public, is_official, status, member_count, post_count, created_at')
        .eq('status', 'active')
        .eq('is_public', true)
        .or(`name.ilike.${pattern},description.ilike.${pattern}`)
        .limit(limit),

      supabase
        .from('channel_posts')
        .select(`${GUEST_POST_COLUMNS}, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url), channel:channels!channel_posts_channel_id_fkey(name)`)
        .eq('status', 'approved')
        // The `visibility` filter is gone. That column is the ad-attribution
        // cloaking flag from the pre-v46 design; v46 stopped every policy
        // reading it and v52 recorded that access_level replaced it entirely.
        // Nothing has maintained it since, so filtering on 'public' silently
        // dropped rows for no reason. RLS already restricts this to approved
        // posts in public active channels.
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
