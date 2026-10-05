import { formatDate } from '@/utils/format';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until (positive) or since (negative) `iso`; null without a date. */
export function daysUntil(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - now) / DAY_MS);
}

/** "Ends 12 Oct 2026 · in 5d", "Ended … · 3d ago", "No end date · lifetime" or "—". */
export function termLabel(
  planStatus: string | null,
  expiresAt: string | null,
  now: number = Date.now(),
): string {
  if (!expiresAt) return planStatus === 'lifetime' ? 'No end date · lifetime' : '—';
  const days = daysUntil(expiresAt, now) ?? 0;
  const date = formatDate(expiresAt);
  if (days > 0) return `Ends ${date} · in ${days}d`;
  if (days === 0) return `Ends today · ${date}`;
  return `Ended ${date} · ${Math.abs(days)}d ago`;
}

/**
 * Still marked 'active' though the term has ended. The expiry sweep runs hourly; access is already
 * gone because the gate reads the date, not the status.
 */
export function isLapsedButUnswept(
  planStatus: string | null,
  expiresAt: string | null,
  now: number = Date.now(),
): boolean {
  const days = daysUntil(expiresAt, now);
  return planStatus === 'active' && days !== null && days <= 0;
}
