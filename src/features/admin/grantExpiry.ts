/** How long an admin grant lasts. */
export type GrantDuration = 'forever' | '7d' | '30d' | 'custom';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a grant ends, as an ISO timestamp, or null for "until revoked". A custom date is typed as
 * YYYY-MM-DD and must be in the future; a bad one throws a message to show the admin.
 */
export function grantExpiry(
  duration: GrantDuration,
  customDate: string,
  now: number = Date.now(),
): string | null {
  if (duration === 'forever') return null;
  if (duration === '7d') return new Date(now + 7 * DAY_MS).toISOString();
  if (duration === '30d') return new Date(now + 30 * DAY_MS).toISOString();

  const date = new Date(customDate.trim());
  if (Number.isNaN(date.getTime())) throw new Error('Enter the custom date as YYYY-MM-DD.');
  if (date.getTime() <= now) throw new Error('That date is in the past.');
  return date.toISOString();
}
