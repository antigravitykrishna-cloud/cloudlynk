import type { ChipTone } from '@/components/ui/Chip';
import { formatDate } from '@/utils/format';
import type { AuditEntry } from '@/features/admin/api/adminContentApi';

/** Human-readable labels for admin_audit_log.action values. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  access_granted: 'Granted access',
  access_revoked: 'Revoked access',
  access_level_changed: 'Changed access level',
  post_status_changed: 'Changed post status',
  post_updated: 'Edited post',
  post_video_replaced: 'Replaced video',
};

const ACTION_TONES: Record<string, ChipTone> = {
  access_granted: 'good',
  access_revoked: 'bad',
  access_level_changed: 'warn',
  post_status_changed: 'brand',
};

/** The chip for an audit action: a readable label, coloured by what kind of change it was. */
export function auditActionChip(action: string): { label: string; tone: ChipTone } {
  return {
    label: (AUDIT_ACTION_LABELS[action] ?? action).toUpperCase(),
    tone: ACTION_TONES[action] ?? 'neutral',
  };
}

/** One line of detail from an entry's metadata, e.g. "free → premium", or null. */
export function describeAuditDetail(entry: Pick<AuditEntry, 'action' | 'metadata'>): string | null {
  const meta = entry.metadata;
  if (!meta) return null;
  if (entry.action === 'access_level_changed' || entry.action === 'post_status_changed') {
    return meta.from || meta.to ? `${meta.from ?? '?'} → ${meta.to ?? '?'}` : null;
  }
  if (entry.action === 'access_granted') {
    const until = meta.expires_at
      ? `until ${formatDate(String(meta.expires_at))}`
      : 'until revoked';
    return meta.reason ? `${until} · ${meta.reason}` : until;
  }
  return null;
}
