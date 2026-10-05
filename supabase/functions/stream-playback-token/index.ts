// stream-playback-token -- hands out a short-lived signed Cloudflare Stream URL for a post's video,
// after deriving on the server that the caller may watch it.
//
// Every video requires a signed URL on Cloudflare's side (locked at upload, or here on first play),
// so this function is the only way to play anything.
//
// What it prevents: anyone without the right to a title building their own playback URL for it.
// What it does not: an entitled viewer sharing the exact URL they were given (it works for anyone
// until it expires), or screen recording. Binding tokens to a device or IP would break viewers who
// change networks mid-video, so it is deliberately not done.
//
// Entitlement, all checked as the caller:
//   - a saved account (guest IDs see previews only), in good standing (a ban stops playback)
//   - the post is readable under row level security (approved, visible channel, not blocked)
//   - a free post, or a paid plan, or an admin grant for this post (has_content_access)
// Every refusal returns the same message, so errors cannot be used to probe which posts exist or
// are premium.
//
// Secrets: CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN, and
//   CLOUDFLARE_STREAM_CUSTOMER_CODE, the `customer-<CODE>` playback subdomain (videodelivery.net
//   does not serve signed playback).
//
// Request:  POST { postId }   (signed in; keep JWT verification on)
// Response: { url }

import { HttpError, readJson, servePost, stringField } from '../_shared/http.ts';
import { lockVideo, streamApi } from '../_shared/cloudflare-stream.ts';
import { adminClient, requireCaller, type Caller } from '../_shared/supabase.ts';

// Long enough for one viewing session, short enough that a leaked URL stops working the same day.
// Cloudflare's maximum is 24 hours.
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

const UNAVAILABLE = "This video isn't available.";

type Post = { id: string; video_url: string; access_level: string; author_id: string };

servePost(
  'stream-playback-token',
  async (req, respond) => {
    const caller = await requireCaller(req);
    if (caller.user.is_anonymous) throw new HttpError(403, 'Save your account to watch.');

    const postId = stringField(await readJson(req), 'postId');
    if (!postId) throw new HttpError(400, 'Missing postId.');

    // Row level security on channel_posts already hides anything the caller may not see, so
    // "not found" and "not allowed" are the same answer here.
    const { data: post, error } = await caller.db
      .from('channel_posts')
      .select('id, video_url, access_level, author_id')
      .eq('id', postId)
      .maybeSingle();
    if (error || !post?.video_url) throw new HttpError(404, UNAVAILABLE);

    if (!(await mayWatch(caller, post))) throw new HttpError(403, UNAVAILABLE);

    await ensureLocked(post);
    return respond({ url: await signedUrl(post.video_url) });
  },
  { fallbackError: UNAVAILABLE },
);

/**
 * Re-derives entitlement even though row level security already required it (defence in depth),
 * and also checks the caller's own standing, which the post's policy does not.
 */
async function mayWatch({ user, db }: Caller, post: Post): Promise<boolean> {
  const { data: me } = await db
    .from('profiles')
    .select('plan_status, plan_expires_at, account_status')
    .eq('id', user.id)
    .maybeSingle();
  // A suspended or banned account holding a paid plan must not keep minting tokens.
  if (!me || me.account_status !== 'active') return false;
  if (post.access_level !== 'premium') return true;

  const notExpired = !me.plan_expires_at || new Date(me.plan_expires_at) > new Date();
  const paid = me.plan_status === 'lifetime' || (me.plan_status === 'active' && notExpired);
  if (paid) return true;

  // An admin can grant one person one post without a plan. Asked through the same RPC the feed
  // uses, so the feed and the player can never disagree about what a live grant is.
  const { data: granted, error } = await db.rpc('has_content_access', {
    p_post_id: post.id,
    p_user_id: user.id,
  });
  if (error) console.error('stream-playback-token: has_content_access failed:', error.message);
  return granted === true;
}

/**
 * Makes sure Cloudflare requires a signed URL for the video before a token is minted. Videos from
 * before lock-at-upload, or with no tracking row, are locked here once and recorded in
 * stream_videos (service role: the app never touches that table).
 */
async function ensureLocked(post: Post): Promise<void> {
  const db = adminClient();
  const uid = post.video_url;
  // limit(1), not maybeSingle(): one UID can have several rows (unique is on user_id + stream_uid).
  const { data: rows } = await db
    .from('stream_videos')
    .select('id, signed_locked')
    .eq('stream_uid', uid)
    .limit(1);
  const tracked = rows?.[0];
  if (tracked?.signed_locked) return;

  const res = await lockVideo(uid);
  if (!res.ok) {
    console.error(
      'stream-playback-token: lock failed:',
      res.status,
      await res.text().catch(() => ''),
    );
    throw new HttpError(502, UNAVAILABLE);
  }

  if (tracked?.id) {
    await db.from('stream_videos').update({ signed_locked: true }).eq('id', tracked.id);
  } else {
    await db.from('stream_videos').insert({
      user_id: post.author_id,
      stream_uid: uid,
      context: 'post_video',
      post_id: post.id,
      signed_locked: true,
    });
  }
}

async function signedUrl(uid: string): Promise<string> {
  const customerCode = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  if (!customerCode) {
    console.error('stream-playback-token: CLOUDFLARE_STREAM_CUSTOMER_CODE is not set');
    throw new HttpError(500, UNAVAILABLE);
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const res = await streamApi(`${uid}/token`, {
    method: 'POST',
    body: JSON.stringify({ exp, downloadable: false }),
  });
  const json = await res.json().catch(() => null);
  const token: string | undefined = json?.result?.token;
  if (!res.ok || !token) {
    console.error('stream-playback-token: token mint failed:', res.status, JSON.stringify(json));
    throw new HttpError(502, UNAVAILABLE);
  }
  return `https://customer-${customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8?token=${token}`;
}
