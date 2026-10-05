import { supabase } from '@/lib/supabase';
import { errorCode, errorMessage } from '@/lib/errors';

// The admin review queue: channels, uploaded files and channel posts waiting for a decision.

export interface PendingChannel {
  id: string;
  name: string;
  owner_id: string;
  description: string | null;
  created_at: string;
  owner_email: string | null;
}

export interface PendingVideo {
  id: string;
  channel_id: string;
  uploaded_by: string;
  storage_path: string;
  title: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
  mime_type: string | null;
  created_at: string;
  channel_name: string | null;
  owner_email: string | null;
}

export interface PendingPost {
  id: string;
  channel_id: string;
  author_id: string;
  title: string | null;
  content_type: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  created_at: string;
  channel_name: string | null;
  author_email: string | null;
}

export type PendingQueue = {
  channels: PendingChannel[];
  videos: PendingVideo[];
  posts: PendingPost[];
};

type Lookup = Record<string, string>;

/** Distinct, in first-seen order. */
export function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Adds owner emails and channel names to the raw pending rows. Unknown ids map to null. */
export function attachLookups(
  rows: {
    channels: Omit<PendingChannel, 'owner_email'>[];
    videos: Omit<PendingVideo, 'channel_name' | 'owner_email'>[];
    posts: Omit<PendingPost, 'channel_name' | 'author_email'>[];
  },
  emails: Lookup,
  channelNames: Lookup,
): PendingQueue {
  return {
    channels: rows.channels.map(r => ({ ...r, owner_email: emails[r.owner_id] ?? null })),
    videos: rows.videos.map(r => ({
      ...r,
      channel_name: channelNames[r.channel_id] ?? null,
      owner_email: emails[r.uploaded_by] ?? null,
    })),
    posts: rows.posts.map(r => ({
      ...r,
      channel_name: channelNames[r.channel_id] ?? null,
      author_email: emails[r.author_id] ?? null,
    })),
  };
}

async function emailsFor(userIds: string[]): Promise<Lookup> {
  if (userIds.length === 0) return {};
  const { data } = await supabase.from('profiles').select('id, email').in('id', userIds);
  return Object.fromEntries((data ?? []).map(p => [p.id, p.email]));
}

async function channelNamesFor(channelIds: string[]): Promise<Lookup> {
  if (channelIds.length === 0) return {};
  const { data } = await supabase.from('channels').select('id, name').in('id', channelIds);
  return Object.fromEntries((data ?? []).map(c => [c.id, c.name]));
}

/** Everything awaiting review, newest first. Throws if any of the three lists fails to load. */
export async function loadPendingQueue(): Promise<PendingQueue> {
  const [channelResult, videoResult, postResult] = await Promise.all([
    supabase
      .from('channels')
      .select('id, name, owner_id, description, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('channel_videos')
      .select(
        'id, channel_id, uploaded_by, storage_path, title, file_size_bytes, duration_seconds, mime_type, created_at',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('channel_posts')
      .select(
        'id, channel_id, author_id, title, content_type, thumbnail_url, video_url, created_at',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  if (channelResult.error) throw channelResult.error;
  if (videoResult.error) throw videoResult.error;
  if (postResult.error) throw postResult.error;

  const rows = {
    channels: channelResult.data ?? [],
    videos: videoResult.data ?? [],
    posts: postResult.data ?? [],
  };

  const [emails, channelNames] = await Promise.all([
    emailsFor(
      unique([
        ...rows.channels.map(r => r.owner_id),
        ...rows.videos.map(r => r.uploaded_by),
        ...rows.posts.map(r => r.author_id),
      ]),
    ),
    channelNamesFor(
      unique([...rows.videos.map(r => r.channel_id), ...rows.posts.map(r => r.channel_id)]),
    ),
  ]);

  return attachLookups(rows, emails, channelNames);
}

/** The server does not have this RPC (an older database). */
export function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  return (
    !!err && (err.code === 'PGRST202' || /could not find the function/i.test(err.message ?? ''))
  );
}

/**
 * Set a channel's status through the audited admin_set_channel_status RPC. Falls back to a direct
 * update if the RPC is missing (PGRST202); that is still safe -- a trigger reverts status writes
 * from non-admins -- but leaves no audit row.
 */
export async function setChannelStatus(channelId: string, status: 'active' | 'rejected') {
  const rpc = await supabase.rpc('admin_set_channel_status', {
    p_channel_id: channelId,
    p_status: status,
  });
  if (!isMissingFunction(rpc.error)) {
    if (rpc.error) throw rpc.error;
    return;
  }

  const { error } = await supabase.from('channels').update({ status }).eq('id', channelId);
  if (!error) return;
  // 23514 is the CHECK violation on channels.status. Pre-v64 the constraint
  // is (pending, active, suspended) with no 'rejected', so rejecting cannot
  // work at all until the migration lands. Say that, rather than surfacing a
  // raw Postgres constraint string to an admin who cannot act on it.
  if (errorCode(error) === '23514') {
    throw new Error(
      'Rejecting needs database migration v64. Run "npx supabase db push" — approving works without it.',
    );
  }
  throw new Error(errorMessage(error));
}

export async function setVideoStatus(videoId: string, status: 'approved' | 'rejected') {
  const { error } = await supabase
    .from('channel_videos')
    .update({
      status,
      ...(status === 'rejected' ? { rejection_reason: 'Rejected by admin' } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', videoId);
  if (error) throw error;
}

/** A one-hour signed URL to watch an uploaded file before deciding. */
export async function videoPreviewUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('channel-videos')
    .createSignedUrl(storagePath, 3600);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

export async function approvePost(postId: string) {
  const { error } = await supabase.rpc('approve_post', { p_post_id: postId });
  if (error) throw error;
}

export async function rejectPost(postId: string) {
  const { error } = await supabase.rpc('reject_post', {
    p_post_id: postId,
    p_reason: 'Rejected by admin',
  });
  if (error) throw error;
}
