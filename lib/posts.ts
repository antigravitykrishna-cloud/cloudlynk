import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type PostStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type ContentType = 'post' | 'movie' | 'series' | 'short';
export type AccessLevel = 'free' | 'premium';

/**
 * v52 default: movies/series are premium unless the creator explicitly
 * marks them free; shorts/posts are free unless explicitly marked premium.
 * This mirrors the pre-v52 de-facto split (see the v52 migration's backfill
 * comment) so nothing changes for existing content or default behavior —
 * it's now just server-enforced via RLS instead of a client-side filter,
 * and creators can override it per upload.
 */
export function defaultAccessLevel(contentType: ContentType): AccessLevel {
  return contentType === 'movie' || contentType === 'series' ? 'premium' : 'free';
}

export type ChannelPost = {
  id: string;
  channel_id: string;
  author_id: string;
  title: string | null;
  body: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  thumbnail_url: string | null;
  content_type: ContentType;
  genre: string | null;
  duration_min: number | null;
  season_number: number | null;
  episode_number: number | null;
  episode_title: string | null;
  release_year: number | null;
  tags: string[] | null;
  status: PostStatus;
  access_level: AccessLevel;
  video_url: string | null;
  submitted_at: string | null;
  series_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  created_at: string;
  author?: { id: string; full_name: string | null; avatar_url: string | null };
  channel?: { name: string };
};

export const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Horror',
  'Romance', 'Sci-Fi', 'Thriller', 'Documentary', 'Animation',
  'Fantasy', 'Crime', 'Mystery', 'Biography', 'Other',
];

export const PostService = {

  // ── Read ────────────────────────────────────────────────────

  async getChannelPosts(channelId: string, userId: string): Promise<ChannelPost[]> {
    const { data: approved, error: e1 } = await supabase
      .from('channel_posts')
      .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
      .eq('channel_id', channelId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });
    if (e1) throw e1;

    const { data: mine, error: e2 } = await supabase
      .from('channel_posts')
      .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
      .eq('channel_id', channelId)
      .eq('author_id', userId)
      .in('status', ['pending', 'rejected'])
      .order('created_at', { ascending: false });
    if (e2) throw e2;

    return [...(mine ?? []), ...(approved ?? [])] as ChannelPost[];
  },

  async getExplorePosts(userId: string, filter?: 'all' | 'popular' | 'most_watched' | 'latest' | 'most_searched'): Promise<ChannelPost[]> {
    // v52: the free/premium split is now enforced server-side by RLS
    // (channel_posts_select_v52 — see the v52 migration) based on each
    // post's own access_level and the caller's plan_status. This function
    // no longer needs to know the viewer's plan or fork its query by it —
    // it just asks for everything reachable, and Postgres decides what
    // actually comes back. That also closes what was previously a
    // client-side-only gate: querying channel_posts directly (with the
    // public anon key) used to return premium movies/series regardless of
    // plan — it can't anymore.

    // Channels the user has explicitly joined — always full access regardless of plan
    const { data: memberships, error: mErr } = await supabase
      .from('channel_members')
      .select('channel_id')
      .eq('user_id', userId);
    if (mErr) throw mErr;
    const myChannelIds = (memberships ?? []).map((m: any) => m.channel_id as string);

    // All active public channels
    const { data: publicChannels, error: cErr } = await supabase
      .from('channels')
      .select('id')
      .eq('is_public', true)
      .eq('status', 'active');
    if (cErr) throw cErr;
    const publicChannelIds = (publicChannels ?? []).map((c: any) => c.id as string);

    // Public channels the user has NOT joined
    const myChannelSet = new Set(myChannelIds);
    const publicOnlyIds = publicChannelIds.filter(id => !myChannelSet.has(id));

    const orderCol = (filter === 'popular' || filter === 'most_watched') ? 'view_count' : 'created_at';

    const results: any[] = [];

    // 1. Content from subscribed channels
    if (myChannelIds.length > 0) {
      const { data, error } = await supabase
        .from('channel_posts')
        .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
        .in('channel_id', myChannelIds)
        .eq('status', 'approved')
        .order(orderCol, { ascending: false })
        .limit(150);
      if (error) throw error;
      results.push(...(data ?? []));
    }

    // 2. Content from public channels the user hasn't joined — RLS silently
    //    filters out any post whose access_level='premium' unless this
    //    user's plan_status is active/lifetime. Free users simply get back
    //    fewer rows; no client-side branching needed.
    if (publicOnlyIds.length > 0) {
      const { data, error } = await supabase
        .from('channel_posts')
        .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
        .in('channel_id', publicOnlyIds)
        .eq('status', 'approved')
        .order(orderCol, { ascending: false })
        .limit(100);
      if (error) throw error;
      results.push(...(data ?? []));
    }

    // Deduplicate by id (a joined channel might also be public)
    const seen = new Set<string>();
    const unique = results.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    return unique.filter(p =>
      p.content_type !== 'post' || p.video_url || p.thumbnail_url || p.media_url
    ) as ChannelPost[];
  },

  async recordView(postId: string) {
    try { await supabase.rpc('record_post_view', { p_post_id: postId }); } catch {}
  },

  /**
   * Groups approved content into Netflix-style rows.
   * Strict type separation: movies only in Movies, series only in Series rows,
   * shorts only in Shorts. Genre rows contain only movies + shorts (not series
   * episodes). Featured shows one representative per type.
   */
  groupByGenre(posts: ChannelPost[]): Record<string, ChannelPost[]> {
    const groups: Record<string, ChannelPost[]> = {};
    const approved = posts.filter(p => p.status === 'approved');

    const movies = approved.filter(p => p.content_type === 'movie');
    const seriesPosts = approved.filter(p => p.content_type === 'series');
    const shorts = approved.filter(p => p.content_type === 'short');

    // Featured: one representative per type, max 5 total
    const featured: ChannelPost[] = [];
    if (movies[0]) featured.push(movies[0]);
    const seenSeriesIds = new Set<string>();
    for (const p of seriesPosts) {
      const key = p.series_id ?? p.id;
      if (!seenSeriesIds.has(key)) { seenSeriesIds.add(key); featured.push(p); }
      if (featured.length >= 5) break;
    }
    if (featured.length < 5 && shorts[0]) featured.push(shorts[0]);
    if (featured.length > 0) groups['Featured'] = featured;

    // Movies row — strictly movies only
    if (movies.length > 0) groups['Movies'] = movies;

    // Series rows — each unique series_id gets its own named row
    const bySeriesId: Record<string, ChannelPost[]> = {};
    const ungroupedSeries: ChannelPost[] = [];
    seriesPosts.forEach(p => {
      if (p.series_id) {
        if (!bySeriesId[p.series_id]) bySeriesId[p.series_id] = [];
        bySeriesId[p.series_id].push(p);
      } else {
        ungroupedSeries.push(p);
      }
    });
    Object.values(bySeriesId).forEach(episodes => {
      const sorted = [...episodes].sort((a, b) => {
        const s = (a.season_number ?? 0) - (b.season_number ?? 0);
        return s !== 0 ? s : (a.episode_number ?? 0) - (b.episode_number ?? 0);
      });
      const rawTitle = sorted[0]?.title ?? 'Series';
      const seriesLabel = rawTitle.replace(/\s*[-:]\s*[Ss]\d+.*$/, '').replace(/\s*[-:]\s*[Ee]p.*$/i, '').trim() || rawTitle;
      groups[`Series: ${seriesLabel}`] = sorted;
    });
    if (ungroupedSeries.length > 0) groups['Web Series'] = ungroupedSeries;

    // Shorts row — strictly shorts only
    if (shorts.length > 0) groups['Shorts'] = shorts;

    // Genre rows — movies and shorts only, not series episodes
    [...movies, ...shorts].forEach(p => {
      if (p.genre) {
        if (!groups[p.genre]) groups[p.genre] = [];
        if (!groups[p.genre].includes(p)) groups[p.genre].push(p);
      }
    });

    // New This Week — all types, last 7 days
    const recent = approved.filter(p => {
      const daysAgo = (Date.now() - new Date(p.created_at).getTime()) / 86400000;
      return daysAgo <= 7;
    });
    if (recent.length > 0) groups['New This Week'] = recent;

    return groups;
  },

  async getPendingPosts(): Promise<ChannelPost[]> {
    const { data, error } = await supabase
      .from('channel_posts')
      .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url), channel:channels(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ChannelPost[];
  },

  async getPendingChannels() {
    const { data, error } = await supabase
      .from('channels')
      // !channels_owner_id_fkey is required: PostgREST sees two channels→profiles
      // paths (the owner_id FK and the channel_members m2m junction) and errors
      // PGRST201 without an explicit hint.
      .select('*, owner:profiles!channels_owner_id_fkey(id, full_name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  // ── Create ──────────────────────────────────────────────────

  async createChannelPost(input: {
    channelId: string;
    authorId: string;
    title: string;
    body?: string;
    contentType: ContentType;
    videoUrl?: string;
    thumbnailUrl?: string;
    durationMin?: number;
    genre?: string;
    releaseYear?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
    accessLevel?: AccessLevel;
  }): Promise<ChannelPost> {
    const { data, error } = await supabase
      .from('channel_posts')
      .insert({
        channel_id: input.channelId,
        author_id: input.authorId,
        title: input.title,
        body: input.body ?? null,
        content_type: input.contentType,
        video_url: input.videoUrl ?? null,
        thumbnail_url: input.thumbnailUrl ?? null,
        duration_min: input.durationMin ?? null,
        genre: input.genre ?? null,
        release_year: input.releaseYear ?? null,
        season_number: input.seasonNumber ?? null,
        episode_number: input.episodeNumber ?? null,
        episode_title: input.episodeTitle ?? null,
        access_level: input.accessLevel ?? defaultAccessLevel(input.contentType),
        status: 'pending',
      })
      .select('*, author:profiles!channel_posts_author_id_fkey(id, full_name, avatar_url)')
      .single();
    if (error) throw error;
    return data as ChannelPost;
  },

  async createPost(
    channelId: string,
    authorId: string,
    body: string,
    options?: {
      title?: string;
      mediaUri?: string;
      mediaType?: 'image' | 'video';
      thumbnailUri?: string;
      contentType?: ContentType;
      genre?: string;
      durationMin?: number;
      seasonNumber?: number;
      episodeNumber?: number;
      episodeTitle?: string;
      releaseYear?: number;
      /** Cloudflare Stream UID — stored directly in video_url */
      streamVideoUid?: string;
      saveAsDraft?: boolean;
      seriesId?: string;
      /** Defaults via defaultAccessLevel(contentType) if not given — see there. */
      accessLevel?: AccessLevel;
    }
  ): Promise<ChannelPost> {
    let mediaUrl: string | null = null;
    let thumbnailUrl: string | null = null;

    if (options?.mediaUri && options?.mediaType) {
      try {
        mediaUrl = await PostService.uploadMedia(authorId, options.mediaUri, options.mediaType);
      } catch {
        mediaUrl = null;
      }
    }
    if (options?.thumbnailUri) {
      thumbnailUrl = await PostService.uploadMedia(authorId, options.thumbnailUri, 'image');
    }

    const videoUrl: string | null = options?.streamVideoUid ?? null;

    // Keep the write on the simplest PostgREST path: plain columns, no FK embed.
    // The author profile isn't needed in the response — the caller refetches via
    // getChannelPosts() right after — and avoiding the embed keeps the insert off
    // any fragile code path. withTimeout() guarantees the UI can never spin
    // forever: a stalled request surfaces as a clear error instead of a hang.
    const { data, error } = await withTimeout(
      supabase
        .from('channel_posts')
        .insert({
          channel_id: channelId,
          author_id: authorId,
          title: options?.title?.trim() || null,
          body: body.trim(),
          media_url: mediaUrl,
          media_type: mediaUrl ? options?.mediaType ?? 'image' : null,
          thumbnail_url: thumbnailUrl,
          content_type: options?.contentType ?? 'post',
          genre: options?.genre || null,
          duration_min: options?.durationMin || null,
          season_number: options?.seasonNumber || null,
          episode_number: options?.episodeNumber || null,
          episode_title: options?.episodeTitle || null,
          release_year: options?.releaseYear || new Date().getFullYear(),
          video_url: videoUrl,
          submitted_at: options?.saveAsDraft ? null : new Date().toISOString(),
          series_id: options?.seriesId ?? null,
          access_level: options?.accessLevel ?? defaultAccessLevel(options?.contentType ?? 'post'),
          status: options?.saveAsDraft ? 'draft' : 'pending',
        })
        .select('*')
        .single(),
      30_000,
      'Saving your content timed out. Please check your connection and try again.'
    );

    if (error) throw error;
    return data as ChannelPost;
  },

  async uploadMedia(userId: string, uri: string, type: 'image' | 'video'): Promise<string> {
    if (typeof document !== 'undefined') {
      throw new Error('File upload is only supported on Android and iOS.');
    }
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const storagePath = `${userId}/${Date.now()}.${ext}`;
    const mimeType = type === 'video' ? 'video/mp4' : 'image/jpeg';

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { error } = await supabase.storage
      .from('channel-media')
      .upload(storagePath, decode(base64), { contentType: mimeType });

    if (error) throw error;
    return storagePath;
  },

  getMediaPublicUrl(storagePath: string): string {
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }
    const { data } = supabase.storage.from('channel-media').getPublicUrl(storagePath);
    return data.publicUrl;
  },

  // ── Admin ───────────────────────────────────────────────────

  async approveChannel(channelId: string) {
    const { error } = await supabase.from('channels').update({ status: 'active' }).eq('id', channelId);
    if (error) throw error;
  },

  async rejectChannel(channelId: string) {
    const { error } = await supabase.from('channels').update({ status: 'suspended' }).eq('id', channelId);
    if (error) throw error;
  },

  async approvePost(postId: string, adminId: string) {
    const { error } = await supabase.from('channel_posts')
      .update({ status: 'approved', approved_by: adminId, approved_at: new Date().toISOString(), rejection_note: null })
      .eq('id', postId);
    if (error) throw error;
  },

  async rejectPost(postId: string, adminId: string, note?: string) {
    const { error } = await supabase.from('channel_posts')
      .update({ status: 'rejected', approved_by: adminId, approved_at: new Date().toISOString(), rejection_note: note ?? null })
      .eq('id', postId);
    if (error) throw error;
  },

  async pickImage(): Promise<{ uri: string; type: 'image' | 'video' } | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') throw new Error('Media library permission denied');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return { uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' };
  },
};

/**
 * Races a thenable against a timeout so a stalled network/auth call can never
 * hang the UI indefinitely. Rejects with `message` if `ms` elapses first.
 */
function withTimeout<T>(thenable: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(thenable).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function decode(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = base64.length;
  let bufferLength = Math.floor(len * 0.75);
  if (base64[len - 1] === '=') bufferLength--;
  if (base64[len - 2] === '=') bufferLength--;
  const buffer = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[base64.charCodeAt(i)], e2 = lookup[base64.charCodeAt(i + 1)];
    const e3 = lookup[base64.charCodeAt(i + 2)], e4 = lookup[base64.charCodeAt(i + 3)];
    buffer[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufferLength) buffer[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufferLength) buffer[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return buffer;
}
