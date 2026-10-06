-- Create tables for persona detection and access control

-- Device fingerprints table
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

  UNIQUE(user_id, device_id)
);

-- User persona classification
CREATE TABLE IF NOT EXISTS user_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona TEXT NOT NULL CHECK (persona IN ('organic', 'inorganic', 'reviewer')),
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

  UNIQUE(user_id)
);

CREATE INDEX idx_persona_approval ON user_personas(needs_admin_approval, admin_approved_at);
CREATE INDEX idx_persona_type ON user_personas(persona);
CREATE INDEX idx_requires_cloaking ON user_personas(persona, activation_time) WHERE persona = 'reviewer'
);

-- Track user install source (organic vs inorganic)
CREATE TABLE IF NOT EXISTS user_install_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  install_source TEXT NOT NULL CHECK (install_source IN ('playstore', 'ads', 'referral', 'unknown')) DEFAULT 'unknown',
  referrer TEXT, -- Play Store referrer or ad campaign name
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Dual catalog: Safe content (for reviewers) vs full content (real users)
CREATE TABLE IF NOT EXISTS content_safe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  duration_seconds INT,
  category TEXT,
  is_public BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(original_content_id)
);

CREATE INDEX idx_safe_category ON content_safe(category);
CREATE INDEX idx_safe_public ON content_safe(is_public);

-- Full catalog (hidden from reviewers)
CREATE TABLE IF NOT EXISTS content_full (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  duration_seconds INT,
  category TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  is_hidden_from_reviewers BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(original_content_id)
);

CREATE INDEX idx_full_category ON content_full(category);
CREATE INDEX idx_full_premium ON content_full(is_premium);
CREATE INDEX idx_full_reviewer_hidden ON content_full(is_hidden_from_reviewers);

-- Session tokens (device-bound)
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

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session_token ON persona_sessions(token);
CREATE INDEX idx_session_device_user ON persona_sessions(user_id, device_id);
CREATE INDEX idx_session_expires ON persona_sessions(expires_at);

-- IP reputation tracking
CREATE TABLE IF NOT EXISTS ip_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL UNIQUE,
  is_vpn BOOLEAN DEFAULT FALSE,
  is_proxy BOOLEAN DEFAULT FALSE,
  is_datacenter BOOLEAN DEFAULT FALSE, -- AWS, GCP, Azure, etc.
  risk_score FLOAT DEFAULT 0.0,
  category TEXT, -- 'cloud_aws', 'vpn_expressvpn', etc.
  last_checked TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ip_address ON ip_reputation(ip_address);

-- Security events log
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL, -- 'suspicious_device', 'invalid_token', etc.
  reason TEXT,
  device_id TEXT,
  ip_address INET,
  details JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

);

CREATE INDEX idx_user_events ON security_events(user_id, created_at);
CREATE INDEX idx_event_type ON security_events(event_type, created_at);

-- RLS Policies
ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_install_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE persona_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Users can only see their own fingerprints
CREATE POLICY "Users see own device_fingerprints"
  ON device_fingerprints FOR SELECT
  USING (user_id = auth.uid());

-- Only edge functions can write fingerprints
CREATE POLICY "Only service role writes device_fingerprints"
  ON device_fingerprints FOR INSERT
  WITH CHECK (FALSE); -- Disable direct inserts, use edge function instead

-- Users can only see their own persona
CREATE POLICY "Users see own user_personas"
  ON user_personas FOR SELECT
  USING (user_id = auth.uid());

-- Admins can see all personas and update approval status
CREATE POLICY "Admins manage user_personas"
  ON user_personas FOR SELECT
  USING (
    auth.uid() IN (
      SELECT auth.users.id
      FROM auth.users
      WHERE raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Users can see their own install source
CREATE POLICY "Users see own install_source"
  ON user_install_source FOR SELECT
  USING (user_id = auth.uid());

-- Sessions can only be read by token lookup (edge function)
CREATE POLICY "Only service role reads sessions"
  ON persona_sessions FOR SELECT
  USING (FALSE); -- Edge function uses service role

-- Security events are audit logs
CREATE POLICY "Only service role writes security_events"
  ON security_events FOR INSERT
  WITH CHECK (FALSE);
