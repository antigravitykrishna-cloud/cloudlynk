-- Extra payload for a notification (e.g. which screen to open). Nullable, so existing rows are untouched.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data jsonb;
