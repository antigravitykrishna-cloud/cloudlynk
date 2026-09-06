// admin-replace-video — swaps the Cloudflare video behind an existing post,
// keeping the post id and therefore every content_access_grants row attached
// to it.
//
// Why this is a function and not a plain UPDATE: replacing the video on a
// PREMIUM post has a Cloudflare half that Postgres cannot do. The new video
// has to be carrying requireSignedURLs=true before it becomes the post's
// video, or there is a window where a premium post serves an unsigned,
// world-readable manifest — the exact hole v57 closed. Doing the swap in SQL
// alone reopens it through a side door.
//
// Ordering is the same fail-safe shape as stream-set-access:
//   1. lock the NEW video on Cloudflare (premium posts only)
//   2. only then point the post at it
// A failure at step 1 leaves the post on its old video, working and correctly
// protected. A failure at step 2 leaves an unused locked video, which costs
// nothing and is repaired by retrying.
//
// The OLD Cloudflare video is deliberately left in place. Deleting is
// irreversible and a swap is often a mistake being corrected; the old UID goes
// into the audit row so it can be restored, or cleaned up on purpose later.
//
// Secrets: CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN
// Deploy: npx supabase functions deploy admin-replace-video
// (keep JWT verification ON — admin-only, and admin_replace_post_video
// re-checks is_admin in the database regardless.)

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

    // Caller-scoped, so the RPC below runs as this admin and the database
    // re-verifies is_admin itself. The check here is an early exit with a
    // clearer message, not the security boundary.
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Authentication required" }, 401);

    const { data: me } = await supabaseUser
      .from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!me?.is_admin) return jsonResponse({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const postId = typeof body?.postId === "string" ? body.postId : "";
    const newUid = typeof body?.newUid === "string" ? body.newUid.trim() : "";
    if (!postId) return jsonResponse({ error: "Missing postId." }, 400);
    if (!newUid) return jsonResponse({ error: "Missing newUid." }, 400);

    // Read as the admin — the v57 policy's is_admin branch covers this.
    const { data: post, error: postErr } = await supabaseUser
      .from("channel_posts")
      .select("id, video_url, access_level")
      .eq("id", postId)
      .maybeSingle();
    if (postErr || !post) return jsonResponse({ error: "Post not found." }, 404);

    if (post.video_url === newUid) {
      return jsonResponse({ ok: true, unchanged: true, uid: newUid });
    }

    // ── Step 1: lock the new video, for premium posts ──
    // Free posts are served from a plain unsigned URL by design, so locking
    // one would break playback for every client using that URL. Only premium
    // needs the lock, and it needs it before the swap, not after.
    let lockedOnCloudflare = false;
    if (post.access_level === "premium") {
      let lockRes: Response;
      try {
        lockRes = await cloudflare(newUid, {
          method: "POST",
          body: JSON.stringify({ uid: newUid, requireSignedURLs: true }),
        });
      } catch (e: any) {
        console.error("admin-replace-video: Cloudflare unreachable:", e?.message ?? e);
        return jsonResponse({
          error: "Could not reach Cloudflare to protect the new video. The post still uses its old video.",
        }, 502);
      }
      if (!lockRes.ok) {
        const detail = await lockRes.text().catch(() => "");
        console.error("admin-replace-video: requireSignedURLs failed:", lockRes.status, detail);
        // 404 from Cloudflare almost always means the UID is wrong or the
        // upload has not finished processing — worth saying so, since it is
        // the mistake an admin will actually make.
        return jsonResponse({
          error: lockRes.status === 404
            ? "Cloudflare does not recognise that video ID. Check the upload finished processing, then try again."
            : "Could not protect the new video on Cloudflare, so the post was left unchanged. Try again.",
        }, 502);
      }
      lockedOnCloudflare = true;
    }

    // ── Step 2: point the post at it ──
    const { error: rpcErr } = await supabaseUser.rpc("admin_replace_post_video", {
      p_post_id: postId,
      p_new_uid: newUid,
    });
    if (rpcErr) {
      console.error("admin-replace-video: admin_replace_post_video failed:", rpcErr.message);
      return jsonResponse({
        error: rpcErr.message ?? "Could not update the post. The new video was protected but not attached.",
      }, 400);
    }

    return jsonResponse({
      ok: true,
      uid: newUid,
      previousUid: post.video_url,
      lockedOnCloudflare,
    });
  } catch (err: any) {
    if (err?.message === "CF_NOT_CONFIGURED") {
      console.error("admin-replace-video: Cloudflare Stream secrets are not set");
      return jsonResponse({ error: "Video service is not configured." }, 500);
    }
    console.error("admin-replace-video error:", err?.message ?? err);
    return jsonResponse({ error: "Something went wrong." }, 500);
  }
});
