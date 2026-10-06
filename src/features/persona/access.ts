export const ACTIVATION_MS = 48 * 60 * 60 * 1000;

export interface AccessInput {
  persona: 'organic' | 'inorganic' | 'reviewer' | 'loading';
  activationTime: number | null;
  needsAdminApproval: boolean;
  isRejected: boolean;
}

export function isActivated(p: AccessInput, now = Date.now()): boolean {
  if (p.persona !== 'organic') return true;
  return p.activationTime !== null && now - p.activationTime >= ACTIVATION_MS;
}

export function hasFullAccess(
  p: AccessInput | null,
  isSubscribed: boolean,
  now = Date.now(),
): boolean {
  if (!p) return false;
  if (p.persona === 'reviewer' || p.persona === 'loading') return false;
  if (p.isRejected) return false;
  if (!isSubscribed) return false;
  if (p.persona === 'organic') return isActivated(p, now) && !p.needsAdminApproval;
  return true;
}
