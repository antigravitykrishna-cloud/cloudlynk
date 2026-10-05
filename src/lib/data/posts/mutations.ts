import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/async';
import { decodeBase64 } from '@/lib/base64';
import { AccessLevel, ChannelPost, ContentType, defaultAccessLevel } from './types';

// guards-allow-select-star
// createPost runs authenticated (it needs the author's id); the insert returns the caller's row.

export type CreatePostOptions = {
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
};

export async function createPost(
  channelId: string,
  authorId: string,
  body: string,
  options?: CreatePostOptions,
): Promise<ChannelPost> {
  let mediaUrl: string | null = null;
  let thumbnailUrl: string | null = null;

  if (options?.mediaUri && options?.mediaType) {
    try {
      mediaUrl = await uploadMedia(authorId, options.mediaUri, options.mediaType);
    } catch {
      mediaUrl = null;
    }
  }
  if (options?.thumbnailUri) {
    thumbnailUrl = await uploadMedia(authorId, options.thumbnailUri, 'image');
  }

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
        media_type: mediaUrl ? (options?.mediaType ?? 'image') : null,
        thumbnail_url: thumbnailUrl,
        content_type: options?.contentType ?? 'post',
        genre: options?.genre || null,
        duration_min: options?.durationMin || null,
        season_number: options?.seasonNumber || null,
        episode_number: options?.episodeNumber || null,
        episode_title: options?.episodeTitle || null,
        release_year: options?.releaseYear || new Date().getFullYear(),
        video_url: options?.streamVideoUid ?? null,
        submitted_at: options?.saveAsDraft ? null : new Date().toISOString(),
        series_id: options?.seriesId ?? null,
        access_level: options?.accessLevel ?? defaultAccessLevel(options?.contentType ?? 'post'),
        status: options?.saveAsDraft ? 'draft' : 'pending',
      })
      .select('*')
      .single(),
    30_000,
    'Saving your content timed out. Please check your connection and try again.',
  );

  if (error) throw error;
  return data as ChannelPost;
}

/** Deletes a post. RLS allows the channel owner and admins. */
export async function deletePost(postId: string) {
  const { error } = await supabase.from('channel_posts').delete().eq('id', postId);
  if (error) throw error;
}

/** Uploads a local file to the channel-media bucket and returns its storage path. */
export async function uploadMedia(
  userId: string,
  uri: string,
  type: 'image' | 'video',
): Promise<string> {
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
    .upload(storagePath, decodeBase64(base64), { contentType: mimeType });

  if (error) throw error;
  return storagePath;
}

/** A storage path (or an already-absolute URL) as a public URL. */
export function getMediaPublicUrl(storagePath: string): string {
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
    return storagePath;
  }
  const { data } = supabase.storage.from('channel-media').getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function pickImage(): Promise<{ uri: string; type: 'image' | 'video' } | null> {
  // System photo picker: no media permission needed.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' };
}
