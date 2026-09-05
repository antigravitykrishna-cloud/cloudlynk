import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").filter(Boolean);
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "";

function corsHeaders(req: Request): Headers {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || (APP_ORIGIN && origin === APP_ORIGIN);
  return new Headers({
    "Access-Control-Allow-Origin": allowed ? origin : (APP_ORIGIN || "*"),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json",
  });
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

// Extract object path from a Supabase storage public/signed URL.
// Public URL: https://<host>/storage/v1/object/public/<bucket>/<path...>
// Signed URL: https://<host>/storage/v1/object/sign/<bucket>/<path...>?...
// Returns the <path...> portion, or null if the URL doesn't match.
function extractStoragePath(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/);
  return match ? match[1] : null;
}

// Pull every <bucket, path> pair we want to remove for a given user.
// Run this BEFORE we delete the user's rows.
async function collectUserStoragePaths(
  supabaseAdmin: any,
  userId: string
): Promise<{ bucket: string; paths: string[] }[]> {
  const out: { bucket: string; paths: string[] }[] = [
    { bucket: "user-files", paths: [] },
    { bucket: "payment-screenshots", paths: [] },
    { bucket: "channel-videos", paths: [] },
    { bucket: "channel-media", paths: [] },
  ];
  const byBucket = (b: string) => out.find((x) => x.bucket === b)!.paths;

  // 1) files.storage_path  -> user-files bucket
  const { data: fileRows } = await supabaseAdmin
    .from("files").select("storage_path").eq("user_id", userId);
  for (const r of fileRows ?? []) {
    if (r.storage_path) byBucket("user-files").push(r.storage_path);
  }

  // 2) profiles.avatar_url -> user-files bucket (only if it's a Supabase URL)
  const { data: prof } = await supabaseAdmin
    .from("profiles").select("avatar_url").eq("id", userId).single();
  const avatarPath = extractStoragePath(prof?.avatar_url);
  if (avatarPath) byBucket("user-files").push(avatarPath);

  // 3) subscription_requests.screenshot_path -> payment-screenshots bucket
  const { data: subs } = await supabaseAdmin
    .from("subscription_requests").select("screenshot_path").eq("user_id", userId);
  for (const r of subs ?? []) {
    if (r.screenshot_path) byBucket("payment-screenshots").push(r.screenshot_path);
  }

  // 4) channel_videos.storage_path + thumbnail_path for videos in channels
  //    owned by this user, plus videos uploaded by this user into channels
  //    owned by someone else. Both cases are deleted from the DB cleanup path,
  //    so we must collect both sets of storage objects up front.
  const { data: userChannels } = await supabaseAdmin
    .from("channels").select("id").eq("owner_id", userId);
  const channelIds = (userChannels ?? []).map((c: { id: string }) => c.id);
  if (channelIds.length > 0) {
    const { data: vids } = await supabaseAdmin
      .from("channel_videos").select("storage_path, thumbnail_path").in("channel_id", channelIds);
    for (const v of vids ?? []) {
      if (v.storage_path) byBucket("channel-videos").push(v.storage_path);
      if (v.thumbnail_path) byBucket("channel-videos").push(v.thumbnail_path);
    }
  }

  const { data: uploadedVids } = await supabaseAdmin
    .from("channel_videos").select("storage_path, thumbnail_path").eq("uploaded_by", userId);
  for (const v of uploadedVids ?? []) {
    if (v.storage_path) byBucket("channel-videos").push(v.storage_path);
    if (v.thumbnail_path) byBucket("channel-videos").push(v.thumbnail_path);
  }

  // 5) channel_posts.media_url + thumbnail_url -> channel-media bucket.
  //    These columns store bare paths like `${userId}/${Date.now()}.jpg`,
  //    not full Supabase URLs. trailer_url + video_url are Cloudflare Stream
  //    references and should not be treated as storage paths.
  const { data: posts } = await supabaseAdmin
    .from("channel_posts")
    .select("media_url, thumbnail_url")
    .eq("author_id", userId);
  for (const p of posts ?? []) {
    for (const url of [p.media_url, p.thumbnail_url]) {
      if (!url) continue;
      const path = url.startsWith("http") ? extractStoragePath(url) : url;
      if (path) byBucket("channel-media").push(path);
    }
  }

  // 6) series.thumbnail_url -> channel-media bucket.
  const { data: seriesRows } = await supabaseAdmin
    .from("series")
    .select("thumbnail_url")
    .eq("owner_id", userId);
  for (const row of seriesRows ?? []) {
    if (!row.thumbnail_url) continue;
    const path = row.thumbnail_url.startsWith("http")
      ? extractStoragePath(row.thumbnail_url)
      : row.thumbnail_url;
    if (path) byBucket("channel-media").push(path);
  }

  for (const entry of out) {
    entry.paths = [...new Set(entry.paths)];
  }

  return out;
}

async function collectUserStreamUids(
  supabaseAdmin: any,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("stream_videos")
    .select("stream_uid")
    .eq("user_id", userId);
  if (error) {
    console.error(`Stream UID collection error for user ${userId}:`, error.message);
    return [];
  }
  return [...new Set((data ?? []).map((row: { stream_uid: string | null }) => row.stream_uid).filter(Boolean))];
}

async function removeStreamVideos(
  supabaseAdmin: any,
  streamUids: string[]
): Promise<void> {
  if (streamUids.length === 0) return;

  const accountId = Deno.env.get("CLOUDFLARE_STREAM_ACCOUNT_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");
  if (!accountId || !apiToken) {
    console.error("Stream cleanup skipped — missing CLOUDFLARE_STREAM_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN");
    return;
  }

  for (const streamUid of streamUids) {
    const { count, error } = await supabaseAdmin
      .from("stream_videos")
      .select("id", { count: "exact", head: true })
      .eq("stream_uid", streamUid);
    if (error) {
      console.error(`Stream reference count failed for ${streamUid}:`, error.message);
      continue;
    }
    if ((count ?? 0) > 0) {
      console.error(`Stream delete skipped for ${streamUid}: shared reference(s) remain`);
      continue;
    }

    try {
      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${apiToken}` } }
      );
      if (!resp.ok) {
        console.error(`Stream delete ${streamUid} failed:`, await resp.text());
      }
    } catch (err) {
      console.error(`Stream delete ${streamUid} threw:`, (err as Error).message);
    }
  }
}

async function removePaths(
  supabaseAdmin: any,
  bucket: string,
  paths: string[]
): Promise<void> {
  if (paths.length === 0) return;
  // Supabase storage remove() can take up to 1000 paths per call.
  const CHUNK = 1000;
  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.storage.from(bucket).remove(slice);
    if (error) {
      console.error(`Storage cleanup error in ${bucket} (${slice.length} paths):`, error.message);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("MISSING_AUTH");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) throw new Error("UNAUTHORIZED");

    const userId = user.id;

    // 1) Gather storage paths BEFORE we delete the rows that reference them.
    const storageTargets = await collectUserStoragePaths(supabaseAdmin, userId);
    const streamUids = await collectUserStreamUids(supabaseAdmin, userId);

    // 2) DB cleanup. Same as before, but ordered so the queries in step 1
    //    already returned their data.
    const cleanup = [
      supabaseAdmin.from("watch_history").delete().eq("user_id", userId),
      supabaseAdmin.from("notifications").delete().eq("user_id", userId),
      supabaseAdmin.from("content_reports").delete().eq("reporter_id", userId),
      supabaseAdmin.from("subscription_requests").delete().eq("user_id", userId),
      supabaseAdmin.from("channel_members").delete().eq("user_id", userId),
      supabaseAdmin.from("channel_posts").delete().eq("author_id", userId),
      supabaseAdmin.from("channel_videos").delete().eq("uploaded_by", userId),
      supabaseAdmin.from("files").delete().eq("user_id", userId),
      supabaseAdmin.from("stream_videos").delete().eq("user_id", userId),
      supabaseAdmin.from("transfers").delete().eq("user_id", userId),
      supabaseAdmin.from("channels").delete().eq("owner_id", userId),
      supabaseAdmin.from("profiles").delete().eq("id", userId),
    ];

    for (const task of cleanup) {
      const { error } = await task;
      if (error) {
        console.error(`Cleanup error for user ${userId}:`, error.message);
      }
    }

    // 3) Storage cleanup. Best-effort, log errors but don't fail the whole
    //    operation — the auth user is about to be deleted regardless.
    for (const { bucket, paths } of storageTargets) {
      try {
        await removePaths(supabaseAdmin, bucket, paths);
      } catch (e) {
        console.error(`Storage cleanup threw in ${bucket}:`, (e as Error).message);
      }
    }

    // 4) Cloudflare Stream cleanup. Only delete a UID if no stream_videos row
    //    remains after the current user's rows were deleted above.
    try {
      await removeStreamVideos(supabaseAdmin, streamUids);
    } catch (e) {
      console.error("Stream cleanup threw:", (e as Error).message);
    }

    // 5) Finally, delete the auth user.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error(`Failed to delete auth user ${userId}:`, delErr.message);
      throw new Error("DELETE_FAILED");
    }

    return jsonResponse(req, { success: true });
  } catch (err: any) {
    console.error("delete-account error:", err.message);
    const clientMessage =
      err.message === "MISSING_AUTH" ? "Authentication required" :
      err.message === "UNAUTHORIZED" ? "Authentication failed" :
      err.message === "DELETE_FAILED" ? "Account deletion failed. Please try again." :
      "An error occurred. Please try again.";
    const statusCode =
      err.message === "MISSING_AUTH" || err.message === "UNAUTHORIZED" ? 401 :
      500;
    return jsonResponse(req, { error: clientMessage }, statusCode);
  }
});
