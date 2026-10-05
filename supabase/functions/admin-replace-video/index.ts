// admin-replace-video -- swaps the Cloudflare video behind an existing post, keeping the post id
// and so every content_access_grants row attached to it.
//
// Why a function and not a plain UPDATE: on a premium post the new video must already require a
// signed URL before the post points at it, or for a moment a premium post serves an unsigned,
// world-readable manifest. Postgres cannot call Cloudflare.
//
// Order, fail-safe:
//   1. lock the NEW video on Cloudflare (premium posts only)
//   2. only then point the post at it (admin_replace_post_video, which writes the audit row)
// A failure at 1 leaves the post on its old video, working and protected. A failure at 2 leaves an
// unused locked video, which costs nothing and is repaired by retrying.
//
// The OLD video is deliberately not deleted: deleting is irreversible and a swap is often a
// mistake being corrected. Its UID is in the audit row.
//
// Request:  POST { postId, newUid }        (admins only; keep JWT verification on)
// Response: { ok, uid, previousUid, lockedOnCloudflare } or { ok, unchanged, uid }

import { HttpError, readJson, servePost, stringField } from '../_shared/http.ts';
import { lockVideo } from '../_shared/cloudflare-stream.ts';
import { requireAdmin, requireCaller } from '../_shared/supabase.ts';

servePost('admin-replace-video', async (req, respond) => {
  const caller = await requireCaller(req);
  await requireAdmin(caller);

  const body = await readJson(req);
  const postId = stringField(body, 'postId');
  const newUid = stringField(body, 'newUid');
  if (!postId) throw new HttpError(400, 'Missing postId.');
  if (!newUid) throw new HttpError(400, 'Missing newUid.');

  const { data: post, error: postError } = await caller.db
    .from('channel_posts')
    .select('id, video_url, access_level')
    .eq('id', postId)
    .maybeSingle();
  if (postError || !post) throw new HttpError(404, 'Post not found.');
  if (post.video_url === newUid) return respond({ ok: true, unchanged: true, uid: newUid });

  // 1. Lock the new video. Only premium needs it before the swap; a free post's video is locked
  //    on first play by stream-playback-token.
  const isPremium = post.access_level === 'premium';
  if (isPremium) await lockOrRefuse(newUid);

  // 2. Point the post at it.
  const { error: swapError } = await caller.db.rpc('admin_replace_post_video', {
    p_post_id: postId,
    p_new_uid: newUid,
  });
  if (swapError) {
    console.error('admin-replace-video: admin_replace_post_video failed:', swapError.message);
    throw new HttpError(
      400,
      swapError.message ??
        'Could not update the post. The new video was protected but not attached.',
    );
  }

  return respond({
    ok: true,
    uid: newUid,
    previousUid: post.video_url,
    lockedOnCloudflare: isPremium,
  });
});

async function lockOrRefuse(uid: string): Promise<void> {
  let res: Response;
  try {
    res = await lockVideo(uid);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('admin-replace-video: Cloudflare unreachable:', err);
    throw new HttpError(
      502,
      'Could not reach Cloudflare to protect the new video. The post still uses its old video.',
    );
  }
  if (res.ok) return;

  console.error('admin-replace-video: lock failed:', res.status, await res.text().catch(() => ''));
  // A 404 almost always means a wrong UID or an upload still processing -- the mistake an admin
  // will actually make, so it gets its own message.
  throw new HttpError(
    502,
    res.status === 404
      ? 'Cloudflare does not recognise that video ID. Check the upload finished processing, then try again.'
      : 'Could not protect the new video on Cloudflare, so the post was left unchanged. Try again.',
  );
}
