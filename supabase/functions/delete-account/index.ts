// delete-account -- deletes the caller's account and everything they own: rows, stored files,
// Cloudflare videos, then the auth user.
//
// Called by the app's Delete Account screen and, from a browser, by the account-deletion web page
// Google Play requires (hence allowSites).
//
// Order matters:
//   1. collect every storage path and video UID, while the rows that point at them still exist
//   2. delete the rows
//   3. delete the stored files and videos (best effort: logged, never blocks the deletion)
//   4. delete the auth user -- the only step whose failure is reported to the caller
//
// Request:  POST {}   (signed in)
// Response: { success: true }

import { HttpError, servePost } from '../_shared/http.ts';
import { streamApi, streamConfigured } from '../_shared/cloudflare-stream.ts';
import { adminClient, requireCaller, type SupabaseClient } from '../_shared/supabase.ts';

type StorageTarget = { bucket: string; paths: string[] };

/** Tables holding the user's rows, and the column that names them. Deleted in this order. */
const OWNED_ROWS: [table: string, column: string][] = [
  ['watch_history', 'user_id'],
  ['notifications', 'user_id'],
  ['content_reports', 'reporter_id'],
  ['subscription_requests', 'user_id'],
  ['channel_members', 'user_id'],
  ['channel_posts', 'author_id'],
  ['channel_videos', 'uploaded_by'],
  ['files', 'user_id'],
  ['stream_videos', 'user_id'],
  ['transfers', 'user_id'],
  ['channels', 'owner_id'],
  ['profiles', 'id'],
];

/** Supabase storage removes at most this many paths per call. */
const STORAGE_REMOVE_BATCH = 1000;

servePost(
  'delete-account',
  async (req, respond) => {
    const { user } = await requireCaller(req);
    const db = adminClient();

    const storageTargets = await collectStoragePaths(db, user.id);
    const streamUids = await collectStreamUids(db, user.id);

    for (const [table, column] of OWNED_ROWS) {
      const { error } = await db.from(table).delete().eq(column, user.id);
      if (error)
        console.error(`delete-account: ${table} cleanup failed for ${user.id}:`, error.message);
    }

    await removeStoredFiles(db, storageTargets);
    await removeStreamVideos(db, streamUids);

    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`delete-account: deleting auth user ${user.id} failed:`, error.message);
      throw new HttpError(500, 'Account deletion failed. Please try again.');
    }
    return respond({ success: true });
  },
  { allowSites: true, fallbackError: 'An error occurred. Please try again.' },
);

/**
 * The object path inside a Supabase storage URL (public or signed), or null for anything else.
 * Some columns hold a bare path instead; those are returned as they are.
 */
function storagePathOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('http')) return value;
  const match = value.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

/** Every stored file the user's rows point at, by bucket. Run BEFORE the rows are deleted. */
async function collectStoragePaths(db: SupabaseClient, userId: string): Promise<StorageTarget[]> {
  const buckets: Record<string, Set<string>> = {
    'user-files': new Set(),
    'payment-screenshots': new Set(),
    'channel-videos': new Set(),
    'channel-media': new Set(),
  };
  const add = (bucket: string, ...values: (string | null | undefined)[]) => {
    for (const value of values) {
      const path = storagePathOf(value);
      if (path) buckets[bucket].add(path);
    }
  };

  const { data: files } = await db.from('files').select('storage_path').eq('user_id', userId);
  for (const file of files ?? []) add('user-files', file.storage_path);

  // Profile pictures are bare paths in channel-media (the app's public media bucket); older ones
  // are full user-files URLs. An external URL (e.g. Google's) matches neither and is skipped.
  const { data: profile } = await db
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .single();
  const avatar: string | null = profile?.avatar_url ?? null;
  if (avatar) add(avatar.startsWith('http') ? 'user-files' : 'channel-media', avatar);

  const { data: requests } = await db
    .from('subscription_requests')
    .select('screenshot_path')
    .eq('user_id', userId);
  for (const request of requests ?? []) add('payment-screenshots', request.screenshot_path);

  // Legacy channel videos: those in the user's channels, and those they uploaded elsewhere.
  const { data: channels } = await db.from('channels').select('id').eq('owner_id', userId);
  const channelIds = (channels ?? []).map((channel: { id: string }) => channel.id);
  if (channelIds.length > 0) {
    const { data: videos } = await db
      .from('channel_videos')
      .select('storage_path, thumbnail_path')
      .in('channel_id', channelIds);
    for (const video of videos ?? [])
      add('channel-videos', video.storage_path, video.thumbnail_path);
  }
  const { data: uploaded } = await db
    .from('channel_videos')
    .select('storage_path, thumbnail_path')
    .eq('uploaded_by', userId);
  for (const video of uploaded ?? [])
    add('channel-videos', video.storage_path, video.thumbnail_path);

  // Post media and thumbnails. (video_url and trailer_url are Cloudflare UIDs, not storage.)
  const { data: posts } = await db
    .from('channel_posts')
    .select('media_url, thumbnail_url')
    .eq('author_id', userId);
  for (const post of posts ?? []) add('channel-media', post.media_url, post.thumbnail_url);

  const { data: series } = await db.from('series').select('thumbnail_url').eq('owner_id', userId);
  for (const row of series ?? []) add('channel-media', row.thumbnail_url);

  return Object.entries(buckets).map(([bucket, paths]) => ({ bucket, paths: [...paths] }));
}

async function collectStreamUids(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await db.from('stream_videos').select('stream_uid').eq('user_id', userId);
  if (error) {
    console.error(`delete-account: collecting video UIDs for ${userId} failed:`, error.message);
    return [];
  }
  return [
    ...new Set((data ?? []).map((row: { stream_uid: string | null }) => row.stream_uid)),
  ].filter((uid): uid is string => !!uid);
}

async function removeStoredFiles(db: SupabaseClient, targets: StorageTarget[]): Promise<void> {
  for (const { bucket, paths } of targets) {
    for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH) {
      const batch = paths.slice(i, i + STORAGE_REMOVE_BATCH);
      try {
        const { error } = await db.storage.from(bucket).remove(batch);
        if (error)
          console.error(`delete-account: removing ${batch.length} from ${bucket}:`, error.message);
      } catch (err) {
        console.error(`delete-account: removing from ${bucket} threw:`, err);
      }
    }
  }
}

/** Deletes each video from Cloudflare, unless another account's row still references it. */
async function removeStreamVideos(db: SupabaseClient, uids: string[]): Promise<void> {
  if (uids.length === 0) return;
  if (!streamConfigured()) {
    console.error('delete-account: Cloudflare Stream secrets not set; videos left in place');
    return;
  }
  for (const uid of uids) {
    const { count, error } = await db
      .from('stream_videos')
      .select('id', { count: 'exact', head: true })
      .eq('stream_uid', uid);
    if (error || (count ?? 0) > 0) {
      console.error(`delete-account: kept video ${uid}:`, error?.message ?? 'still referenced');
      continue;
    }
    try {
      const res = await streamApi(uid, { method: 'DELETE' });
      if (!res.ok) console.error(`delete-account: deleting video ${uid} failed:`, await res.text());
    } catch (err) {
      console.error(`delete-account: deleting video ${uid} threw:`, err);
    }
  }
}
