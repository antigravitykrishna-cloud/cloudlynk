/**
 * REMOVED — 24 Aug 2026, Play Store compliance hardening.
 *
 * This module used to detect whether an install/open came from a tracked ad
 * click (gclid/fbclid/ttclid/utm_*) and sync that to `profiles.acquisition_source`,
 * which backend RLS policies then used to show certain channels/posts only to
 * ad-attributed users. That is traffic-source-based content gating — the
 * technical shape of "cloaking" under Google Play's Deceptive Behavior policy
 * — so both the client-side detection (this file) and the backend RLS branch
 * that used it have been removed. See `docs/PLAY_STORE_COMPLIANCE_AUDIT.md`
 * (Finding 0) and `supabase/migrations/20260824120000_v46_compliance_hardening.sql`.
 *
 * Left as an empty module (rather than deleted outright) so any stray import
 * fails loudly at build time instead of silently resolving to nothing.
 */
export {};
