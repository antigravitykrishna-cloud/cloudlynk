-- v45: Rate limiting for generate-stream-upload edge function
--
-- Problem: generate-stream-upload had no rate limit. A malicious or buggy
-- client could call it repeatedly, burning Cloudflare Stream API quota and
-- creating orphaned direct-upload URLs.
--
-- Design: a small append-only log table, written by the service role only
-- (edge function uses SUPABASE_SERVICE_ROLE_KEY). No RLS policies are added
-- because no client role (anon/authenticated) is ever granted access — same
-- pattern as stream_videos in v41. The edge function counts rows for the
-- calling user in the last 60 seconds before allowing a new upload URL.
--
-- Apply via: npx supabase db push --linked

CREATE TABLE IF NOT EXISTS public.upload_rate_limit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup for "how many requests has this user made in the last minute".
CREATE INDEX IF NOT EXISTS idx_upload_rate_limit_user_time
  ON public.upload_rate_limit_log (user_id, created_at DESC);

COMMENT ON TABLE public.upload_rate_limit_log IS
  'Per-user request log for generate-stream-upload rate limiting. Service-role writes only, no client access. Rows older than 1 day are pruned opportunistically by the edge function.';

-- No RLS — deliberately unreachable from anon/authenticated (no GRANTs given,
-- matching public.stream_videos). Only the service role (used by edge
-- functions) can read/write this table.

NOTIFY pgrst, 'reload schema';
