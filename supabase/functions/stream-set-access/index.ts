// stream-set-access — the ONLY safe way to change a post's access_level.
//
// ── Why this function exists (TRAP 2) ──
// v54's stream-playback-token permanently sets `requireSignedURLs=true` on a
// Cloudflare video the first time a premium post is played, and caches that
// in stream_videos.signed_locked. Free playback uses a plain unsigned
// videodelivery.net URL (see lib/stream.ts getHlsPlaybackUrl) — which a
// signed-URL-locked video rejects.
//
// So flipping a post premium -> free in the database alone leaves the video
// permanently unplayable for everyone, with no error anybody can diagnose:
// the post looks free, the player just fails. Postgres cannot call
// Cloudflare, so the unlock has to happen here, in the app layer, wrapped
// around the access_level change.
//
// ── Ordering, and why it is this way round ──
//   1. clear stream_videos.signed_locked
//   2. tell Cloudflare requireSignedURLs=false
//   3. only then change access_level to 'free'
//
// Every intermediate failure leaves the system biased towards LOCKED, never
// towards a leak. If step 2 or 3 fails the post is still premium and
// signed_locked is false, so the next playback-token request re-asserts the
// lock on Cloudflare and repairs itself. Doing it the other way round (DB
// first) would leave a premium video served unsigned — a real leak — or a
// free post with a dead player, which is the bug we are fixing.
//
// The access_level change is NOT reported as successful unless the
// Cloudflare call succeeded.
//
// free -> premium needs no Cloudflare call at all: stream-playback-token
// asserts requireSignedURLs on demand the first time someone plays it.
//
// Deploy: npx supabase functions deploy stream-set-access
// (keep JWT verification ON — admin-only, and the RPCs re-check that.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

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

    // Caller-scoped: every read and every RPC below runs as this admin, so
    // the database re-verifies is_admin itself. This function's own check is
    // just an early exit with a clearer message.
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Authentication required" }, 401);

    const { data: me } = await supabaseUser
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (!me?.is_admin) return jsonResponse({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const postId = typeof body?.postId === "string" ? body.postId : "";
    const accessLevel = body?.accessLevel === "free" || body?.accessLevel === "premium"
      ? body.accessLevel
      : "";
    if (!postId) return jsonResponse({ error: "Missing postId." }, 400);
    if (!accessLevel) return jsonResponse({ error: "accessLevel must be 'free' or 'premium'." }, 400);

    // The admin branch of channel_posts_select_v56 lets an admin read any post.
    const { data: post, error: postErr } = await supabaseUser
      .from("channel_posts")
      .select("id, video_url, access_level")
      .eq("id", postId)
      .maybeSingle();
    if (postErr || !post) return jsonResponse({ error: "Post not found." }, 404);

    if (post.access_level === accessLevel) {
      return jsonResponse({ ok: true, unchanged: true, accessLevel });
    }

    const goingFree = post.access_level === "premium" && accessLevel === "free";
    const uid: string | null = post.video_url ?? null;

    if (goingFree && uid) {
      // 1. Clear the cached flag FIRST. If anything below fails, the post is
      //    still premium with signed_locked=false, so the next playback-token
      //    request re-locks the video on Cloudflare and the system repairs
      //    itself rather than leaking an unsigned premium video.
      const { error: clearErr } = await supabaseUser.rpc("admin_clear_signed_lock", {
        p_stream_uid: uid,
      });
      if (clearErr) {
        console.error("stream-set-access: admin_clear_signed_lock failed:", clearErr.message);
        return jsonResponse({ error: "Could not update video access. Nothing was changed." }, 500);
      }

      // 2. Unlock on Cloudflare. Idempotent.
      let patchRes: Response;
      try {
        patchRes = await cloudflare(uid, {
          method: "POST",
          body: JSON.stringify({ uid, requireSignedURLs: false }),
        });
      } catch (e: any) {
        console.error("stream-set-access: Cloudflare unreachable:", e?.message ?? e);
        return jsonResponse({
          error: "Could not unlock the video on Cloudflare, so the access level was left unchanged. Try again.",
        }, 502);
      }
      if (!patchRes.ok) {
        console.error("stream-set-access: requireSignedURLs=false failed:", patchRes.status, await patchRes.text().catch(() => ""));
        return jsonResponse({
          error: "Could not unlock the video on Cloudflare, so the access level was left unchanged. Try again.",
        }, 502);
      }
    }

    // 3. Only now change the access level. Writes the audit row too.
    const { error: rpcErr } = await supabaseUser.rpc("admin_set_post_access_level", {
      p_post_id: postId,
      p_access_level: accessLevel,
    });
    if (rpcErr) {
      console.error("stream-set-access: admin_set_post_access_level failed:", rpcErr.message);
      return jsonResponse({ error: rpcErr.message ?? "Could not change the access level." }, 400);
    }

    return jsonResponse({ ok: true, accessLevel, unlockedOnCloudflare: goingFree && !!uid });
  } catch (err: any) {
    if (err?.message === "CF_NOT_CONFIGURED") {
      console.error("stream-set-access: Cloudflare Stream secrets are not set");
      return jsonResponse({ error: "Video service is not configured." }, 500);
    }
    console.error("stream-set-access error:", err?.message ?? err);
    return jsonResponse({ error: "Could not change the access level." }, 500);
  }
});
