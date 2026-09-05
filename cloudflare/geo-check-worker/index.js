// geo-check-worker — country lookup + block decision, served from Cloudflare's
// edge instead of a third-party IP-lookup API.
//
// Why this exists: the app used to call https://ipapi.co/json/ from the
// client to resolve the user's country, which meant forwarding every user's
// IP address to a third party never disclosed in the privacy policy. This
// Worker replaces that: Cloudflare already terminates the request and knows
// the connecting IP's country via `request.cf.country` — no extra network
// hop, no new company touching the user's IP, and Cloudflare is already a
// disclosed processor for this app (Stream, R2).
//
// The actual blocklist stays admin-configurable from inside the app (writes
// to Supabase `app_settings.geo_block_enabled` / `blocked_countries`, see
// migration v49's admin-write policy) — this Worker just reads those two
// rows on every request so there is exactly one source of truth, not a
// separate copy baked into the Worker.
//
// Deploy:
//   cd cloudflare/geo-check-worker
//   npx wrangler login                              # once, opens a browser
//   npx wrangler secret put SUPABASE_ANON_KEY        # paste the anon key
//   npx wrangler deploy
// Then put the printed *.workers.dev URL into app.json's
// `extra.GEO_CHECK_WORKER_URL` and rebuild, or override it via EAS env vars
// without a full rebuild if using EAS Update.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Cache-Control': 'no-store',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const country = request.cf?.country ?? null;
    let blocked = false;

    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/app_settings?key=in.(geo_block_enabled,blocked_countries)&select=key,value`,
        {
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          },
        }
      );
      if (res.ok) {
        const rows = await res.json();
        const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        const enabled = map.geo_block_enabled === true;
        const blockedCountries = Array.isArray(map.blocked_countries) ? map.blocked_countries : [];
        blocked = enabled && !!country && blockedCountries.includes(country);
      }
    } catch {
      // Fail open — a misconfigured or unreachable Supabase must never lock
      // every user out of the app. Worse case: geo-blocking is briefly inert,
      // never that legitimate users get shut out.
      blocked = false;
    }

    return new Response(JSON.stringify({ country, blocked }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  },
};
