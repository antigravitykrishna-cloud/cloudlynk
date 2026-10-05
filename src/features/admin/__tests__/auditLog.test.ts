import { auditActionChip, describeAuditDetail } from '@/features/admin/auditLog';

describe('auditActionChip', () => {
  it('labels and colours known actions', () => {
    expect(auditActionChip('access_revoked')).toEqual({ label: 'REVOKED ACCESS', tone: 'bad' });
  });

  it('falls back to the raw action, neutral', () => {
    expect(auditActionChip('something_new')).toEqual({ label: 'SOMETHING_NEW', tone: 'neutral' });
  });
});

describe('describeAuditDetail', () => {
  it('shows a change as from → to', () => {
    expect(
      describeAuditDetail({
        action: 'access_level_changed',
        metadata: { from: 'free', to: 'premium' },
      }),
    ).toBe('free → premium');
  });

  it('shows how long a grant lasts and why', () => {
    expect(
      describeAuditDetail({ action: 'access_granted', metadata: { reason: 'Press preview' } }),
    ).toBe('until revoked · Press preview');
  });

  it('has nothing to add for other actions or without metadata', () => {
    expect(describeAuditDetail({ action: 'post_updated', metadata: { title: 'x' } })).toBeNull();
    expect(describeAuditDetail({ action: 'access_granted', metadata: null })).toBeNull();
  });
});
