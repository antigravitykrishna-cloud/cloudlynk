// stream-set-access -- the only safe way to change a post's access_level.
//
// Every video is born locked (requireSignedURLs, see generate-stream-upload) and plays through a
// token from stream-playback-token, free titles included. So:
//   free -> premium  lock the video on Cloudflare FIRST (re-asserted in case it was ever
//                    unlocked), and refuse the change if that fails. Locking first means any
//                    failure leaves the post free, never premium-but-served-unsigned.
//   premium -> free  no Cloudflare call: the video stays locked, and free posts get tokens
//                    without needing a plan.
// The level itself changes through admin_set_post_access_level, which writes the audit row.
//
// Request:  POST { postId, accessLevel: 'free' | 'premium' }   (admins only; keep JWT verification on)
// Response: { ok, accessLevel, lockedOnCloudflare } or { ok, unchanged, accessLevel }

import { HttpError, readJson, servePost, stringField } from '../_shared/http.ts';
import { lockVideo } from '../_shared/cloudflare-stream.ts';
import { requireAdmin, requireCaller, type Caller } from '../_shared/supabase.ts';

const LOCK_FAILED =
  'Could not lock the video on Cloudflare, so the access level was left unchanged. Try again.';

servePost(
  'stream-set-access',
  async (req, respond) => {
    const caller = await requireCaller(req);
    await requireAdmin(caller);

    const body = await readJson(req);
    const postId = stringField(body, 'postId');
    const accessLevel = stringField(body, 'accessLevel');
    if (!postId) throw new HttpError(400, 'Missing postId.');
    if (accessLevel !== 'free' && accessLevel !== 'premium') {
      throw new HttpError(400, "accessLevel must be 'free' or 'premium'.");
    }

    const { data: post, error: postError } = await caller.db
      .from('channel_posts')
      .select('id, video_url, access_level')
      .eq('id', postId)
      .maybeSingle();
    if (postError || !post) throw new HttpError(404, 'Post not found.');
    if (post.access_level === accessLevel)
      return respond({ ok: true, unchanged: true, accessLevel });

    const uid: string | null = post.video_url ?? null;
    const lockFirst = accessLevel === 'premium' && !!uid;
    if (lockFirst) await lock(caller, uid);

    const { error: changeError } = await caller.db.rpc('admin_set_post_access_level', {
      p_post_id: postId,
      p_access_level: accessLevel,
    });
    if (changeError) {
      console.error('stream-set-access: admin_set_post_access_level failed:', changeError.message);
      throw new HttpError(400, changeError.message ?? 'Could not change the access level.');
    }

    return respond({ ok: true, accessLevel, lockedOnCloudflare: lockFirst });
  },
  { fallbackError: 'Could not change the access level.' },
);

/** Locks the video on Cloudflare, or refuses the whole change. */
async function lock(caller: Caller, uid: string): Promise<void> {
  let res: Response;
  try {
    res = await lockVideo(uid);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('stream-set-access: Cloudflare unreachable while locking:', err);
    throw new HttpError(502, LOCK_FAILED);
  }
  if (!res.ok) {
    console.error('stream-set-access: lock failed:', res.status, await res.text().catch(() => ''));
    throw new HttpError(502, LOCK_FAILED);
  }

  // Record it, so stream-playback-token skips re-asserting the lock. Best-effort: a failure costs
  // one redundant Cloudflare call on first play, not correctness.
  const { error } = await caller.db.rpc('admin_set_signed_lock', { p_stream_uid: uid });
  if (error)
    console.error('stream-set-access: admin_set_signed_lock failed (non-fatal):', error.message);
}
