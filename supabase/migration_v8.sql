-- ============================================================
-- STREAMLY MIGRATION V8 — username column + plan enum normalization
-- Run this in Supabase SQL Editor AFTER all prior migrations
-- Idempotent: safe to re-run; no-op if already applied
-- ============================================================

-- ── 1. Add username column to profiles (forward-compat for admin + product) ──
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- ── 2. Backfill username from email prefix for existing users ──
-- Strip the @domain, lowercase, and trim
UPDATE public.profiles
  SET username = LOWER(TRIM(split_part(email, '@', 1)))
  WHERE username IS NULL OR username = '';

-- ── 3. Replace the plan check constraint FIRST ──
-- MUST run before the UPDATE in step 4 — the UPDATE writes 'standard' which the
-- old constraint would reject. Drop every check on profiles that mentions plan.
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'profiles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%plan%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

-- Re-add with the correct enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'profiles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%standard%'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_plan_check
      CHECK (plan IN ('free', 'standard', 'premium'));
  END IF;
END $$;

-- ── 4. NOW safe to normalize any pre-existing plan values ──
-- Old enum was 'free' | 'pro' | 'enterprise'. No-op if no legacy values exist.
UPDATE public.profiles SET plan = 'standard' WHERE plan = 'pro';
UPDATE public.profiles SET plan = 'premium'  WHERE plan = 'enterprise';

-- ── 5. Update signup trigger so new users get a username automatically ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    LOWER(TRIM(split_part(NEW.email, '@', 1)))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger already exists from migration_v1 (schema.sql). The CREATE OR REPLACE
-- above updates the function; the trigger itself does not need to be re-created.

-- ── 6. Helpful index for future username-based lookups (e.g., @mentions) ──
CREATE INDEX IF NOT EXISTS profiles_username_idx
  ON public.profiles(username)
  WHERE username IS NOT NULL;

-- ============================================================
-- DONE. Verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('username', 'plan');
--   SELECT DISTINCT plan FROM public.profiles;
-- ============================================================
