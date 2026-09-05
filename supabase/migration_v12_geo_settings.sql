-- migration_v12_geo_settings.sql
-- Creates app_settings table for geo-blocking and other runtime configs.
-- Apply via Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read app_settings" ON app_settings;
CREATE POLICY "Anyone can read app_settings" ON app_settings FOR SELECT USING (true);

-- Default: geo-blocking disabled
INSERT INTO app_settings (key, value) VALUES ('geo_block_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('blocked_countries', '[]'::jsonb)
  ON CONFLICT (key) DO NOTHING;
