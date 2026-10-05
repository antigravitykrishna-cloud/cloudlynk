// generate-stream-upload -- a one-time Cloudflare Stream upload URL, so the app uploads a video
// straight to Cloudflare without ever holding our API token.
//
// Who may upload: into a channel, whoever can_post_to_channel allows; without a channel, admins
// only (only admins publish). Each user gets at most RATE_LIMIT_PER_MINUTE URLs a minute, which
// protects the Stream quota from abuse or a looping client.
//
// Every video is born requiring a signed URL. Locking at birth means the failure mode is "does not
// play until stream-playback-token signs it" (visible, harmless), never "premium video served to
// anyone holding the UID" (silent).
//
// Request:  POST { fileName, fileSize, channelId? }   (signed in)
// Response: { uploadURL, uid }

import { HttpError, readJson, servePost, stringField } from '../_shared/http.ts';
import { streamApi } from '../_shared/cloudflare-stream.ts';
import { adminClient, requireCaller, type Caller } from '../_shared/supabase.ts';

const MAX_FILE_SIZE_BYTES = 180 * 1024 * 1024;
const MAX_DURATION_SECONDS = 2 * 60 * 60;
const MAX_FILENAME_LENGTH = 255;
const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv'];
const RATE_LIMIT_PER_MINUTE = 10;

servePost(
  'generate-stream-upload',
  async (req, respond) => {
    const caller = await requireCaller(req);
    const body = await readJson(req);
    const fileName = stringField(body, 'fileName');
    const fileSize = Number(body.fileSize);
    const channelId = stringField(body, 'channelId') || null;

    validateFile(fileName, fileSize);
    await requireUploadRight(caller, channelId);
    await enforceRateLimit(caller.user.id);

    const res = await streamApi('direct_upload', {
      method: 'POST',
      body: JSON.stringify({
        maxDurationSeconds: MAX_DURATION_SECONDS,
        requireSignedURLs: true,
        meta: {
          userId: caller.user.id,
          fileName: fileName.slice(0, 100),
          channelId: channelId ?? undefined,
        },
      }),
    });
    if (!res.ok) {
      console.error('generate-stream-upload: Cloudflare error:', await res.text());
      throw new HttpError(500, 'Upload service unavailable');
    }
    const { result } = await res.json();

    // Recorded as already locked, so stream-playback-token does not re-assert it on first play.
    const { error } = await adminClient()
      .from('stream_videos')
      .upsert(
        {
          user_id: caller.user.id,
          stream_uid: result.uid,
          context: channelId ? 'post_video' : 'channel_video',
          post_id: null,
          signed_locked: true,
        },
        { onConflict: 'user_id,stream_uid', ignoreDuplicates: true },
      );
    if (error) console.error('generate-stream-upload: stream_videos insert failed:', error.message);

    return respond({ uploadURL: result.uploadURL, uid: result.uid });
  },
  { allowSites: true, fallbackError: 'An error occurred. Please try again.' },
);

function validateFile(fileName: string, fileSize: number): void {
  if (!Number.isFinite(fileSize) || fileSize <= 0) throw new HttpError(400, 'Invalid file size');
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(400, `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit`);
  }
  if (!fileName || fileName.length > MAX_FILENAME_LENGTH) {
    throw new HttpError(400, 'Invalid file name');
  }
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(extension)) throw new HttpError(400, 'File type not supported');
}

async function requireUploadRight({ user, db }: Caller, channelId: string | null): Promise<void> {
  const NO_PERMISSION = "You don't have upload permissions";
  if (channelId) {
    const { data: canPost, error } = await db.rpc('can_post_to_channel', {
      p_channel_id: channelId,
    });
    if (error || !canPost) throw new HttpError(403, NO_PERMISSION);
    return;
  }
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) throw new HttpError(403, NO_PERMISSION);
}

/** Refuses the request past the per-minute limit, then logs it (before the Cloudflare call). */
async function enforceRateLimit(userId: string): Promise<void> {
  const db = adminClient();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await db
    .from('upload_rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', oneMinuteAgo);
  if (error) {
    console.error('generate-stream-upload: rate limit check failed:', error.message);
  } else if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    throw new HttpError(429, 'Too many upload requests. Please wait a minute and try again.');
  }

  const { error: logError } = await db.from('upload_rate_limit_log').insert({ user_id: userId });
  if (logError) console.error('generate-stream-upload: rate limit log failed:', logError.message);
}
