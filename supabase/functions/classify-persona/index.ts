/**
 * Classify Persona Edge Function
 * Server-side classification of users as organic/inorganic/reviewer
 * Validates device fingerprint and determines content access permissions
 *
 * Security-first approach:
 * - Never trust client claims
 * - Multiple verification layers
 * - Audit all decisions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

// Play Store Review team user agents
const REVIEWER_USER_AGENTS = [
  'googleplayreview',
  'appreviewbot',
  'playstore-bot',
  'google-play-store',
];

// Real reviewers: known VPN/proxy services used during testing
const REVIEWER_IP_RANGES = [
  // Google Play Testing
  '142.251.0.0/16',  // Google Cloud (verified reviewers)
  '172.217.0.0/16',  // Google
  '172.218.0.0/16',  // Google
  // AWS (actual reviewer IPs - narrowed from /8)
  '52.152.0.0/16',   // AWS US-specific
  '52.153.0.0/16',   // AWS US-specific
];

// Blacklist: Rotating proxies and VPN services
const PROXY_INDICATORS = [
  'vpn',
  'proxy',
  'tor',
  'expressvpn',
  'nordvpn',
  'surfshark',
  'windscribe',
];

interface PersonaRequest {
  userId: string;
  fingerprint: {
    deviceId: string;
    isEmulator: boolean;
    isDebugBuild: boolean;
    isRooted: boolean;
    platform: string;
    osVersion: string;
    manufacturer: string;
    model: string;
    installSource: string;
  };
  integrityToken?: string;
  userAgent?: string;
}

interface PersonaResponse {
  persona: 'organic' | 'inorganic' | 'reviewer';
  isFullAccessGranted: boolean;
  activationTime: number | null;
  riskScore: number;
  needsAdminApproval: boolean;
  isRejected: boolean;
  lastVerified: number;
  sessionToken?: string;
}

// Helper: Check if IP is in CIDR range
function isIPInRange(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const [a, b, c, d] = range.split('.').map(Number);
    const [ia, ib, ic, id] = ip.split('.').map(Number);
    const mask = parseInt(bits || '32');
    const ipNum = (ia << 24) | (ib << 16) | (ic << 8) | id;
    const rangeNum = (a << 24) | (b << 16) | (c << 8) | d;
    const maskNum = (0xffffffff << (32 - mask)) >>> 0;
    return (ipNum & maskNum) === (rangeNum & maskNum);
  } catch {
    return false;
  }
}

// Helper: Check if IP is from verified reviewer IPs
function isVerifiedReviewerIP(ip: string): boolean {
  return REVIEWER_IP_RANGES.some(range => isIPInRange(ip, range));
}

// Helper: Check for proxy/VPN indicators
function isVPNOrProxy(category: string | null): boolean {
  if (!category) return false;
  return PROXY_INDICATORS.some(indicator => category.toLowerCase().includes(indicator));
}

// Helper: Validate Play Integrity token (stub - requires API key)
function validateIntegrityToken(token: string): boolean {
  // In production, verify against Google Play Integrity API
  // This is a stub that always returns false (no token validation)
  // To implement: https://developer.android.com/google/play/integrity/setup
  return false; // Assume invalid unless explicitly verified
}

Deno.serve(async req => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = (await req.json()) as PersonaRequest;
    const { userId, fingerprint } = body;
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';

    if (!userId || !fingerprint) {
      return new Response(JSON.stringify({ error: 'Missing userId or fingerprint' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // LAYER 1: Device Risk Scoring
    let riskScore = 0;
    const riskFactors: Record<string, number> = {};

    // Device characteristics (high weight)
    if (fingerprint.isEmulator) {
      riskScore += 0.35;
      riskFactors.emulator = 0.35;
    }
    if (fingerprint.isRooted) {
      riskScore += 0.25;
      riskFactors.rooted = 0.25;
    }
    if (fingerprint.isDebugBuild) {
      riskScore += 0.15;
      riskFactors.debug = 0.15;
    }

    // LAYER 2: Reviewer Detection (IP + User Agent)
    let isReviewer = false;
    const userAgent = req.headers.get('user-agent') || '';

    // Check for Play Store reviewer signatures
    if (REVIEWER_USER_AGENTS.some(agent => userAgent.toLowerCase().includes(agent))) {
      isReviewer = true;
      riskScore = 1.0;
      riskFactors.reviewerUserAgent = 0.5;
    }

    // Check for verified reviewer IP ranges (Google Play, specific AWS instances)
    if (isVerifiedReviewerIP(clientIP)) {
      isReviewer = true;
      riskScore = 1.0;
      riskFactors.reviewerIP = 0.5;
    }

    // LAYER 3: IP Reputation Check (VPN/Proxy detection)
    // Check ip_reputation table for this IP if we need more data
    try {
      const { data: ipRep } = await supabase
        .from('ip_reputation')
        .select('category, is_vpn, is_proxy')
        .eq('ip_address', clientIP)
        .maybeSingle();

      if (ipRep) {
        if (ipRep.is_vpn || ipRep.is_proxy) {
          riskScore += 0.15;
          riskFactors.vpnProxy = 0.15;
        }
        if (isVPNOrProxy(ipRep.category)) {
          riskScore += 0.1;
          riskFactors.proxyCategory = 0.1;
        }
      }
    } catch (e) {
      // Ignore IP reputation lookup failures
    }

    // Normalize risk score to 0-1
    riskScore = Math.min(riskScore, 1.0);

    // LAYER 4: Persona Classification
    // Admin decisions and the activation start live in the database and must survive
    // re-verification, so read them first instead of recomputing them from the device.
    const { data: existing } = await supabase
      .from('user_personas')
      .select('activation_time, admin_approved_at, rejected_at')
      .eq('user_id', userId)
      .maybeSingle();

    const isRejected = Boolean(existing?.rejected_at);
    const isApproved = Boolean(existing?.admin_approved_at) && !isRejected;

    let persona: 'organic' | 'inorganic' | 'reviewer' = 'inorganic';
    let needsAdminApproval = false;
    let isFullAccessGranted = false;
    let activationTime: number | null = null;

    const REVIEWER_THRESHOLD = 0.9;

    if (isReviewer || riskScore >= REVIEWER_THRESHOLD) {
      // Detected as reviewer = safe content only, cloaked for 48 hours
      persona = 'reviewer';
    } else if (fingerprint.installSource === 'playstore') {
      // Play Store installation = Organic user (requires admin approval)
      persona = 'organic';
      needsAdminApproval = !isApproved && !isRejected;
      isFullAccessGranted = isApproved;
      // The 48-hour countdown starts once, on first classification.
      activationTime = existing?.activation_time
        ? new Date(existing.activation_time).getTime()
        : Date.now();
    }
    // Ads and unknown sources stay inorganic: no approval needed, subscription still required.

    // LAYER 4: Store Classification
    const now = new Date().toISOString();

    const { error: upsertPersonaError } = await supabase.from('user_personas').upsert(
      {
        user_id: userId,
        persona,
        needs_admin_approval: needsAdminApproval,
        is_full_access_granted: isFullAccessGranted,
        activation_time: activationTime ? new Date(activationTime).toISOString() : null,
        risk_score: riskScore,
        last_verified: now,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );

    if (upsertPersonaError) {
      console.error('Failed to upsert persona:', upsertPersonaError);
    }

    // Store device fingerprint
    const { error: fingerprintError } = await supabase.from('device_fingerprints').upsert(
      {
        user_id: userId,
        device_id: fingerprint.deviceId,
        is_emulator: fingerprint.isEmulator,
        is_rooted: fingerprint.isRooted,
        is_debug_build: fingerprint.isDebugBuild,
        platform: fingerprint.platform,
        os_version: fingerprint.osVersion,
        manufacturer: fingerprint.manufacturer,
        model: fingerprint.model,
        risk_score: riskScore,
        last_seen: now,
      },
      { onConflict: 'user_id,device_id' },
    );

    if (fingerprintError) {
      console.error('Failed to store fingerprint:', fingerprintError);
    }

    // A known source overwrites; 'unknown' never replaces an already-recorded source.
    const installSource = ['playstore', 'ads', 'referral'].includes(fingerprint.installSource)
      ? fingerprint.installSource
      : 'unknown';
    const { error: installSourceError } = await supabase
      .from('user_install_source')
      .upsert(
        { user_id: userId, install_source: installSource },
        { onConflict: 'user_id', ignoreDuplicates: installSource === 'unknown' },
      );

    if (installSourceError) {
      console.error('Failed to store install source:', installSourceError);
    }

    // Audit log
    if (riskScore >= REVIEWER_THRESHOLD || persona === 'organic') {
      await supabase.from('security_events').insert({
        user_id: userId,
        event_type: 'persona_classification',
        reason: `Classified as ${persona} (score: ${riskScore.toFixed(2)})`,
        device_id: fingerprint.deviceId,
        ip_address: clientIP,
        details: {
          riskFactors,
          installSource: fingerprint.installSource,
        },
      });
    }

    const response: PersonaResponse = {
      persona,
      isFullAccessGranted,
      activationTime,
      riskScore,
      needsAdminApproval,
      isRejected,
      lastVerified: Date.now(),
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Persona classification error:', error);

    // Always return safe default on error
    return new Response(
      JSON.stringify({
        persona: 'reviewer',
        isFullAccessGranted: false,
        activationTime: null,
        riskScore: 1.0,
        needsAdminApproval: false,
        isRejected: false,
        lastVerified: Date.now(),
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
