// stream-playback-token — mints a short-lived signed Cloudflare Stream
// playback URL for a Premium video, but only after deriving server-side that
// the caller is actually entitled to watch it.
//
// Why this exists: without it, a Premium post's video plays from a plain
// https://<customer>.cloudflarestream.com/<uid>/manifest/video.m3u8 URL that
// anyone with the link can open — the app's RLS stops a Free user from
// *reading the post row*, but the video URL itself was public. This function
// makes the video require a signed token on Cloudflare's side, and hands out
// tokens only to entitled callers.
//
// ── What this protects, and what it does NOT ──
// PREVENTS, completely: a Free or logged-out user generating their own valid
//   playback URL for a Premium video.
// DOES NOT prevent: a Premium viewer who was legitimately handed a signed URL
//   passing that exact URL to someone else — it keeps playing for anyone who
//   has it until it expires (~6h). This is inherent to every signed-URL video
//   service, not a gap specific to this implementation. Also does not stop
//   screen recording. Binding tokens to a device/IP would narrow the first
//   case but breaks legitimate users who change networks mid-video, so it is
//   deliberately not done here.
//
// Reuses the Supabase secrets `generate-stream-upload` already relies on:
//   CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN
// plus one new one:
//   CLOUDFLARE_STREAM_CUSTOMER_CODE  — the `customer-<CODE>` playback
//     subdomain (videodelivery.net does NOT serve signed playback).
//
// Deploy: npx supabase functions deploy stream-playback-token
// (keep JWT verification ON — only signed-in users should reach this.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

// ~6 hours: long enough for one uninterrupted viewing session, short enough
// that a leaked URL stops working the same day. Cloudflare's max is 24h.
const TOKEN_TTL_SECONDS = 6 * 60 * 60;

// One generic message for every rejection so the error itself can't be used
// to probe which posts are Premium or whether a given post exists.
const UNAVAILABLE = "This video isn't available.";

async function cloudflare(path: string, init: RequestInit): Promise<Response> {
  const accountId = Deno.env.get("CLOUDFLARE_STREAM_ACCOUNT_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
  if (!accountId || !apiToken) throw new Error("CF_NOT_CONFIGURED");
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authentication required" }, 401);

    // Caller-scoped client: every channel_posts / profiles read below runs
    // under THIS user's RLS, so we never see a row they couldn't see.
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const postId = typeof body?.postId === "string" ? body.postId : "";
    if (!postId) return jsonResponse({ error: "Missing postId." }, 400);

    // channel_posts_select_v52 (v52 migration) already governs this read. It
    // enforces, on SELECT: approved status; author account active; not
    // blocked; caller is a channel member OR the channel is public+active;
    // AND access_level='free' OR caller's plan_status IN ('active','lifetime').
    // So a non-entitled or non-member caller gets no row here — we return 404
    // and don't distinguish "not found" from "not allowed".
    const { data: post, error: postErr } = await supabaseUser
      .from("channel_posts")
      .select("id, video_url, access_level, channel_id, author_id")
      .eq("id", postId)
      .maybeSingle();
    if (postErr || !post || !post.video_url) {
      return jsonResponse({ error: UNAVAILABLE }, 404);
    }

    // Free content normally plays from a plain unsigned URL the client builds
    // synchronously, and never reaches here. It IS allowed to reach here, as a
    // fallback: since v57 every video is created with requireSignedURLs=true
    // (see generate-stream-upload), so a free post whose unlock in
    // stream-set-access failed would otherwise be permanently unplayable. The
    // client retries through this function when the unsigned URL fails, and a
    // free post mints a token with no entitlement requirement.
    //
    // Serving free content here is not a widening of access: the RLS read
    // above already proved the caller may see this post, and the token is
    // scoped to this one video and expires. What must never happen is the
    // reverse — a PREMIUM video served unsigned — which is why the
    // entitlement block below is skipped only for access_level='free'.
    const isPremium = post.access_level === "premium";

    // Defence in depth: re-derive entitlement here even though RLS above
    // already required it. Reading your own profile is allowed by RLS.
    const { data: me, error: meErr } = await supabaseUser
      .from("profiles")
      .select("plan_status, plan_expires_at, account_status")
      .eq("id", user.id)
      .maybeSingle();
    if (meErr || !me) return jsonResponse({ error: UNAVAILABLE }, 403);

    // v57: the CALLER's own account standing. Nothing checked this before.
    //
    // channel_posts_select_v56 checks account_status on the post's AUTHOR
    // (so a banned creator's work disappears) and has_content_access checks
    // it on the GRANTEE (so a banned user loses admin grants) — but a
    // suspended or banned user holding a paid plan_status still satisfied
    // the subscription branch, and so kept minting fresh 6-hour premium
    // tokens for as long as their refresh token lived. Banning someone has
    // to actually stop their playback, or it isn't a ban.
    //
    // Checked before the entitlement branch, and for free content too: a
    // banned account should not be pulling video at all.
    if (me.account_status !== "active") {
      return jsonResponse({ error: UNAVAILABLE }, 403);
    }

    const notExpired = !me.plan_expires_at || new Date(me.plan_expires_at) > new Date();
    const paid = me.plan_status === "lifetime" || (me.plan_status === "active" && notExpired);

    // v56: a paid subscription is not the only way to be entitled. An admin
    // can grant one named user access to one named post
    // (content_access_grants) without giving them a subscription.
    //
    // This re-check has to know about grants too. channel_posts_select_v56
    // already lets a grant holder READ the post, so if this stayed
    // plan_status-only they would see the post in the feed and then get a
    // 403 the moment they pressed play — visibly broken, and the exact
    // half-built failure this layer exists to prevent.
    //
    // Called on the CALLER-SCOPED client so the check runs as that user, and
    // via the has_content_access RPC rather than a reimplementation of the
    // condition, so the feed and the player can never disagree about what a
    // live grant is.
    let entitled = !isPremium || paid;
    if (!entitled) {
      const { data: granted, error: grantErr } = await supabaseUser.rpc("has_content_access", {
        p_post_id: postId,
        p_user_id: user.id,
      });
      if (grantErr) {
        console.error("stream-playback-token: has_content_access failed:", grantErr.message);
      }
      entitled = granted === true;
    }

    // Same generic message whether they lack a subscription or a grant —
    // a distinct error for the grant case would let someone probe which
    // posts are premium.
    if (!entitled) return jsonResponse({ error: UNAVAILABLE }, 403);

    const uid = post.video_url;

    // ── Ensure the video is locked on Cloudflare's side before minting ──
    // service-role client: stream_videos has no RLS and clients never touch it.
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // .limit(1) not .maybeSingle(): a re-uploaded UID could in theory have
    // more than one stream_videos row (unique is on (user_id, stream_uid)).
    const { data: trackedRows } = await supabaseAdmin
      .from("stream_videos")
      .select("id, signed_locked")
      .eq("stream_uid", uid)
      .limit(1);
    const tracked = trackedRows?.[0];

    // Only PREMIUM playback may assert the lock. A free post arriving here is
    // either already locked (the unlock failed — the fallback case this path
    // exists for, and the token below is what rescues it) or still unlocked
    // and playing fine unsigned for everyone else. Locking it here would take
    // a working free video and break it for every client still using the
    // plain URL, which is the opposite of the fallback's purpose. A token
    // minted against an unlocked video is simply ignored by Cloudflare, so
    // the free path needs no lock of its own.
    if (isPremium && !tracked?.signed_locked) {
      // The edit call is idempotent — safe whether or not it was already true. This
      // self-heals videos flagged premium before this system existed, or
      // switched from free to premium after upload.
      const patchRes = await cloudflare(uid, {
        method: "POST",
        body: JSON.stringify({ uid, requireSignedURLs: true }),
      });
      if (!patchRes.ok) {
        console.error("stream-playback-token: requireSignedURLs edit failed:", patchRes.status, await patchRes.text().catch(() => ""));
        return jsonResponse({ error: UNAVAILABLE }, 502);
      }
      if (tracked?.id) {
        await supabaseAdmin.from("stream_videos").update({ signed_locked: true }).eq("id", tracked.id);
      } else {
        // No tracking row (e.g. an old upload predating stream_videos, or a
        // backfill gap) — create one so the next request is fast.
        await supabaseAdmin.from("stream_videos").insert({
          user_id: post.author_id,
          stream_uid: uid,
          context: "post_video",
          post_id: post.id,
          signed_locked: true,
        });
      }
    }

    // ── Mint the token ──
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const tokenRes = await cloudflare(`${uid}/token`, {
      method: "POST",
      body: JSON.stringify({ exp, downloadable: false }),
    });
    const tokenJson = await tokenRes.json().catch(() => null);
    const token: string | undefined = tokenJson?.result?.token;
    if (!tokenRes.ok || !token) {
      console.error("stream-playback-token: token mint failed:", tokenRes.status, JSON.stringify(tokenJson));
      return jsonResponse({ error: UNAVAILABLE }, 502);
    }

    const customerCode = Deno.env.get("CLOUDFLARE_STREAM_CUSTOMER_CODE");
    if (!customerCode) {
      console.error("stream-playback-token: CLOUDFLARE_STREAM_CUSTOMER_CODE is not set");
      return jsonResponse({ error: UNAVAILABLE }, 500);
    }

    const url = `https://customer-${customerCode}.cloudflarestream.com/${uid}/manifest/video.m3u8?token=${token}`;
    return jsonResponse({ url });
  } catch (err: any) {
    console.error("stream-playback-token error:", err?.message ?? err);
    return jsonResponse({ error: UNAVAILABLE }, 500);
  }
});
