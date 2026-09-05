import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").filter(Boolean);
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "";

const MAX_FILE_SIZE_BYTES = 180 * 1024 * 1024;
const MAX_DURATION_SECONDS = 7200;
const MAX_FILENAME_LENGTH = 255;
const ALLOWED_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "mkv"];
const RATE_LIMIT_PER_MINUTE = 10;

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

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  return parts[parts.length - 1] ?? "";
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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("UNAUTHORIZED");

    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new Error("INVALID_BODY");
    }

    const fileSize = Number(body?.fileSize);
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    const channelId = body?.channelId ? String(body.channelId) : null;

    if (!Number.isFinite(fileSize) || fileSize <= 0) throw new Error("INVALID_SIZE");
    if (fileSize > MAX_FILE_SIZE_BYTES) throw new Error("FILE_TOO_LARGE");
    if (!fileName || fileName.length > MAX_FILENAME_LENGTH) throw new Error("INVALID_NAME");

    const ext = getExtension(fileName);
    if (!ALLOWED_EXTENSIONS.includes(ext)) throw new Error("INVALID_EXTENSION");

    if (channelId) {
      const { data: canPost, error: rpcError } = await supabaseClient
        .rpc("can_post_to_channel", { p_channel_id: channelId });
      if (rpcError || !canPost) throw new Error("NO_PERMISSION");
    } else {
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("can_upload_content, is_admin")
        .eq("id", user.id)
        .single();
      if (profileError || (!profile?.can_upload_content && !profile?.is_admin)) {
        throw new Error("NO_PERMISSION");
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Rate limit: max RATE_LIMIT_PER_MINUTE upload URLs per user per rolling minute.
    // Protects the Cloudflare Stream API quota from abuse or a buggy client.
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateLimitError } = await supabaseAdmin
      .from("upload_rate_limit_log")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", oneMinuteAgo);
    if (rateLimitError) {
      console.error("rate limit check failed:", rateLimitError.message);
    } else if ((recentCount ?? 0) >= RATE_LIMIT_PER_MINUTE) {
      throw new Error("RATE_LIMITED");
    }
    // Log this attempt before doing the expensive Cloudflare call.
    const { error: rateLimitLogError } = await supabaseAdmin
      .from("upload_rate_limit_log")
      .insert({ user_id: user.id });
    if (rateLimitLogError) {
      console.error("rate limit log insert failed:", rateLimitLogError.message);
    }

    const accountId = Deno.env.get("CLOUDFLARE_STREAM_ACCOUNT_ID");
    const apiToken = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN");

    const streamResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds: MAX_DURATION_SECONDS,
          meta: {
            userId: user.id,
            fileName: fileName.slice(0, 100),
            channelId: channelId ?? undefined,
          },
        }),
      }
    );

    if (!streamResponse.ok) {
      console.error("Cloudflare Stream API error:", await streamResponse.text());
      throw new Error("STREAM_API_FAILED");
    }

    const data = await streamResponse.json();
    const uid = data.result.uid;

    const { error: trackErr } = await supabaseAdmin
      .from("stream_videos")
      .upsert(
        {
          user_id: user.id,
          stream_uid: uid,
          context: channelId ? "post_video" : "channel_video",
          post_id: null,
        },
        {
          onConflict: "user_id,stream_uid",
          ignoreDuplicates: true,
        }
      );
    if (trackErr) {
      console.error("stream_videos insert failed:", trackErr.message);
    }

    return jsonResponse(req, { uploadURL: data.result.uploadURL, uid });
  } catch (err: any) {
    console.error("generate-stream-upload error:", err.message);
    const clientMessage =
      err.message === "MISSING_AUTH" ? "Authentication required" :
      err.message === "UNAUTHORIZED" ? "Authentication failed" :
      err.message === "INVALID_BODY" ? "Invalid request body" :
      err.message === "INVALID_SIZE" ? "Invalid file size" :
      err.message === "FILE_TOO_LARGE" ? `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB limit` :
      err.message === "INVALID_NAME" ? "Invalid file name" :
      err.message === "INVALID_EXTENSION" ? "File type not supported" :
      err.message === "NO_PERMISSION" ? "You don't have upload permissions" :
      err.message === "RATE_LIMITED" ? "Too many upload requests. Please wait a minute and try again." :
      err.message === "STREAM_API_FAILED" ? "Upload service unavailable" :
      "An error occurred. Please try again.";
    const statusCode =
      err.message === "MISSING_AUTH" || err.message === "UNAUTHORIZED" ? 401 :
      err.message === "INVALID_BODY" || err.message === "INVALID_SIZE" ||
      err.message === "FILE_TOO_LARGE" || err.message === "INVALID_NAME" ||
      err.message === "INVALID_EXTENSION" ? 400 :
      err.message === "NO_PERMISSION" ? 403 :
      err.message === "RATE_LIMITED" ? 429 :
      500;
    return jsonResponse(req, { error: clientMessage }, statusCode);
  }
});
