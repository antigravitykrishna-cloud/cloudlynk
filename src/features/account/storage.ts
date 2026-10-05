/** How full the person's storage is, 0-100. An unset or zero limit reads as empty, not infinite. */
export function storagePercent(usedBytes: number, limitBytes: number): number {
  if (!limitBytes || limitBytes <= 0) return 0;
  return Math.min((usedBytes / limitBytes) * 100, 100);
}

/** The free allowance, shown before the profile has loaded. */
export const DEFAULT_STORAGE_LIMIT_BYTES = 15 * 1024 * 1024 * 1024;
