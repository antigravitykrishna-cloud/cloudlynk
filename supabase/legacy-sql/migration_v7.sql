-- Add Push Notifications and Profile Sync Preferences

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS fcm_token TEXT,
ADD COLUMN IF NOT EXISTS auto_backup BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS wifi_only BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;
