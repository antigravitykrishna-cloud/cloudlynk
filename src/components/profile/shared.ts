/** Up to two initials from a full name, or "??" without one. */
export function initials(fullName: string | null | undefined): string {
  if (!fullName) return '??';
  return fullName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Share of storage used, 0-100. */
export function storagePercent(used: number, limit: number): number {
  return Math.min((used / limit) * 100, 100);
}

/** Badge colours and label for a channel's moderation status. */
export function channelStatusBadge(status: string | null): {
  bg: string;
  fg: string;
  label: string;
} {
  if (status === 'active') return { bg: '#A7F3D0', fg: '#065F46', label: 'Active' };
  if (status === 'pending') return { bg: '#FEF3C7', fg: '#92400E', label: 'Pending' };
  return { bg: '#FECACA', fg: '#991B1B', label: 'Suspended' };
}
