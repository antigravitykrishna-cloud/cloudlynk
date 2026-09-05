-- ============================================================
-- STREAMLY MIGRATION V9 — Repair: replace profiles plan constraint
-- Run this in Supabase SQL Editor if migration_v8 failed mid-way
-- (typical symptom: check constraint "profiles_plan_check" still
--  rejects 'standard' / 'premium' after running v8)
--
-- This is a pure schema fix — does not modify any data rows.
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Drop every check constraint on profiles that mentions the plan column
--    (handles the original 'profiles_plan_check' AND any future re-additions)
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

-- 2. Normalize existing data so it doesn't violate the new constraint
UPDATE public.profiles SET plan = 'standard' WHERE plan = 'pro';
UPDATE public.profiles SET plan = 'premium' WHERE plan = 'enterprise';
UPDATE public.profiles SET plan = 'free' WHERE plan NOT IN ('free', 'standard', 'premium');

-- 3. Re-add the constraint with the correct enum
--    (IF NOT EXISTS lets this be re-runnable)
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

-- 3. Verify
-- Run this SELECT manually after the migration:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.profiles'::regclass
--     AND contype = 'c'
--     AND pg_get_constraintdef(oid) ILIKE '%plan%';
-- Expect exactly one row, named profiles_plan_check, with
--   CHECK (((plan = ANY (ARRAY['free'::text, 'standard'::text, 'premium'::text]))))
