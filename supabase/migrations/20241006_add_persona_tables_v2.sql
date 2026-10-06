-- Persona Detection System - Database Schema
-- Enables classification of users into personas (reviewer/organic/inorganic)
-- with device binding, IP reputation, and secure session management

-- Create ENUM types for better type safety
CREATE TYPE persona_type AS ENUM ('organic', 'inorganic', 'reviewer');
CREATE TYPE install_source_type AS ENUM ('playstore', 'ads', 'referral', 'unknown');

-- Device fingerprints table
-- Stores device characteristics for identification and security checks
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  is_emulator BOOLEAN DEFAULT FALSE,
  is_rooted BOOLEAN DEFAULT FALSE,
  is_debug_build BOOLEAN DEFAULT FALSE,
  platform TEXT NOT NULL, -- 'ios' or 'android'
  os_version TEXT,
  manufacturer TEXT,
  model TEXT,
  risk_score FLOAT DEFAULT 0.0, -- 0.0 (safe) to 1.0 (risky)
  last_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, device_id),
  INDEX idx_device_user ON device_fingerprints(user_id, device_id),
  INDEX idx_risk_score ON device_fingerprints(risk_score)
);

-- User persona classification
-- Tracks which "persona" each user is assigned to and approval status
CREATE TABLE IF NOT EXISTS user_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona persona_type NOT NULL,
  -- organic: Downloaded from Play Store, needs admin approval
  -- inorganic: Came via ads/redirects, can buy premium directly
  -- reviewer: Detected as reviewer/bot, sees safe content only

  is_full_access_granted BOOLEAN DEFAULT FALSE,
  needs_admin_approval BOOLEAN DEFAULT FALSE,
  admin_approved_at TIMESTAMP,
  admin_approved_by UUID REFERENCES auth.users(id),

  activation_time TIMESTAMP, -- Start of 48-hour activation period
  activated_at TIMESTAMP, -- When 48-hour period completed

  risk_score FLOAT DEFAULT 0.0,
  last_verified TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id),
  INDEX idx_persona_approval ON user_personas(needs_admin_approval, admin_approved_at),
  INDEX idx_persona_type ON user_personas(persona),
  INDEX idx_risk_score ON user_personas(risk_score)
);

-- Track user install source (organic vs inorganic)
-- Records where user downloaded/accessed the app from
CREATE TABLE IF NOT EXISTS user_install_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  install_source install_source_type DEFAULT 'unknown',
  referrer TEXT, -- Play Store referrer or ad campaign name
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id),
  INDEX idx_install_source ON user_install_source(install_source)
);

-- Session tokens (device-bound)
-- Secure, device-bound session tokens that expire and rotate
CREATE TABLE IF NOT EXISTS persona_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  device_binding_hash TEXT NOT NULL, -- Hash of device characteristics

  is_valid BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP NOT NULL,
  rotation_count INT DEFAULT 0,
  last_rotated TIMESTAMP DEFAULT NOW(),

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_token ON persona_sessions(token),
  INDEX idx_device_user ON persona_sessions(user_id, device_id),
  INDEX idx_expires ON persona_sessions(expires_at)
);

-- IP reputation tracking
-- Caches IP reputation checks to identify data centers, VPNs, proxies
CREATE TABLE IF NOT EXISTS ip_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL UNIQUE,
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  is_datacenter BOOLEAN DEFAULT FALSE, -- AWS, GCP, Azure, etc.
  risk_score FLOAT DEFAULT 0.0,
  category TEXT, -- 'cloud_aws', 'vpn_expressvpn', etc.
  last_checked TIMESTAMP DEFAULT NOW(),

  INDEX idx_ip ON ip_reputation(ip_address)
);

-- Security events log
-- Audit trail of suspicious activities and classification decisions
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'suspicious_device', 'invalid_token', etc.
  reason TEXT,
  device_id TEXT,
  ip_address INET,
  details JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_user_events ON security_events(user_id, created_at),
  INDEX idx_event_type ON security_events(event_type, created_at)
);

-- Enable Row Level Security (RLS)
ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_install_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for device_fingerprints
-- Users can only see their own fingerprints
CREATE POLICY "Users see own device_fingerprints"
  ON device_fingerprints FOR SELECT
  USING (user_id = auth.uid());

-- Only edge functions (service role) can write fingerprints
CREATE POLICY "Only service role writes device_fingerprints"
  ON device_fingerprints FOR INSERT
  WITH CHECK (FALSE); -- Disable direct inserts, use edge function instead

-- RLS Policies for user_personas
-- Users can only see their own persona
CREATE POLICY "Users see own user_personas"
  ON user_personas FOR SELECT
  USING (user_id = auth.uid());

-- Admins can see all personas and update approval status
CREATE POLICY "Admins manage user_personas"
  ON user_personas FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT auth.users.id
      FROM auth.users
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT auth.users.id
      FROM auth.users
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

-- RLS Policies for user_install_source
-- Users can see their own install source
CREATE POLICY "Users see own install_source"
  ON user_install_source FOR SELECT
  USING (user_id = auth.uid());

-- RLS Policies for persona_sessions
-- Sessions can only be read by token lookup (edge function uses service role)
CREATE POLICY "Only service role reads sessions"
  ON persona_sessions FOR SELECT
  USING (FALSE); -- Edge function uses service role

-- RLS Policies for security_events
-- Audit logs only written by service role
CREATE POLICY "Only service role writes security_events"
  ON security_events FOR INSERT
  WITH CHECK (FALSE);

-- Helper function to check if IP is in known reviewer ranges
CREATE OR REPLACE FUNCTION is_reviewer_ip(check_ip INET)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check against known cloud provider IP ranges (examples)
  RETURN check_ip <<= ANY(ARRAY[
    '3.0.0.0/8'::CIDR,      -- AWS
    '35.0.0.0/8'::CIDR,     -- Google Cloud
    '52.0.0.0/8'::CIDR,     -- AWS
    '54.0.0.0/8'::CIDR,     -- AWS
    '13.0.0.0/8'::CIDR,     -- Azure
    '40.0.0.0/8'::CIDR,     -- Azure
    '104.0.0.0/8'::CIDR,    -- Google
    '207.97.227.0/24'::CIDR  -- GitHub (example)
  ]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to mark user as needing activation
CREATE OR REPLACE FUNCTION mark_activation_needed(user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE user_personas
  SET activation_time = NOW()
  WHERE user_personas.user_id = mark_activation_needed.user_id
    AND persona = 'organic'
    AND activation_time IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Helper function to check if user is activated (48+ hours)
CREATE OR REPLACE FUNCTION is_activated(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_personas
    WHERE user_personas.user_id = is_activated.user_id
      AND (
        persona != 'organic'
        OR (activation_time IS NOT NULL
            AND (NOW() - activation_time) >= INTERVAL '48 hours')
      )
  );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to service role (edge functions)
GRANT ALL ON device_fingerprints TO service_role;
GRANT ALL ON user_personas TO service_role;
GRANT ALL ON user_install_source TO service_role;
GRANT ALL ON persona_sessions TO service_role;
GRANT ALL ON ip_reputation TO service_role;
GRANT ALL ON security_events TO service_role;
GRANT EXECUTE ON FUNCTION is_reviewer_ip TO service_role;
GRANT EXECUTE ON FUNCTION mark_activation_needed TO service_role;
GRANT EXECUTE ON FUNCTION is_activated TO service_role;
