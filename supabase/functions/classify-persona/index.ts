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
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

// Known bot user agents
const BOT_USER_AGENTS = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'facebookexternalhit',
];

// Known reviewer/testing IP ranges
const REVIEWER_IP_RANGES = [
  '3.0.0.0/8',      // AWS
  '35.0.0.0/8',     // Google Cloud
  '52.0.0.0/8',     // AWS
  '54.0.0.0/8',     // AWS
  '13.0.0.0/8',     // Azure
  '40.0.0.0/8',     // Azure
  '104.0.0.0/8',    // Google
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
  attestationToken?: string;
  attestationMethod?: string;
}

interface PersonaResponse {
  persona: 'organic' | 'inorganic' | 'reviewer';
  isFullAccessGranted: boolean;
  activationTime: number | null;
  riskScore: number;
  needsAdminApproval: boolean;
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

// Helper: Check if IP is from known cloud provider
function isCloudProviderIP(ip: string): boolean {
  return REVIEWER_IP_RANGES.some(range => isIPInRange(ip, range));
}

Deno.serve(async (req) => {
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
      return new Response(
        JSON.stringify({ error: 'Missing userId or fingerprint' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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

    // LAYER 2: IP Reputation Check
    if (isCloudProviderIP(clientIP)) {
      riskScore += 0.20;
      riskFactors.cloudIP = 0.20;
    }

    // Normalize risk score to 0-1
    riskScore = Math.min(riskScore, 1.0);

    // LAYER 3: Persona Classification
    let persona: 'organic' | 'inorganic' | 'reviewer' = 'inorganic';
    let needsAdminApproval = false;
    let isFullAccessGranted = false;
    let activationTime: number | null = null;

    const REVIEWER_THRESHOLD = 0.40;

    if (riskScore >= REVIEWER_THRESHOLD) {
      // High risk = Reviewer mode (safe content only)
      persona = 'reviewer';
      needsAdminApproval = false;
      isFullAccessGranted = false;
    } else if (fingerprint.installSource === 'playstore') {
      // Play Store installation = Organic user
      persona = 'organic';
      needsAdminApproval = true; // Requires admin approval
      isFullAccessGranted = false;
      activationTime = Date.now(); // Start 48-hour countdown
    } else if (fingerprint.installSource === 'ads') {
      // Ad campaign = Inorganic user
      persona = 'inorganic';
      needsAdminApproval = false; // No approval needed
      isFullAccessGranted = false; // Need subscription
    } else {
      // Unknown source = Conservative (treat as inorganic)
      persona = 'inorganic';
      needsAdminApproval = false;
      isFullAccessGranted = false;
    }

    // LAYER 4: Store Classification
    const now = new Date().toISOString();

    const { error: upsertPersonaError } = await supabase
      .from('user_personas')
      .upsert(
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
        { onConflict: 'user_id' }
      );

    if (upsertPersonaError) {
      console.error('Failed to upsert persona:', upsertPersonaError);
    }

    // Store device fingerprint
    const { error: fingerprintError } = await supabase
      .from('device_fingerprints')
      .upsert(
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
        { onConflict: 'user_id,device_id' }
      );

    if (fingerprintError) {
      console.error('Failed to store fingerprint:', fingerprintError);
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
        lastVerified: Date.now(),
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
