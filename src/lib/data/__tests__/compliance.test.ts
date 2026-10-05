import { ComplianceService, POLICY_VERSIONS, isAdultOnFile } from '@/lib/data/compliance';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2026-10-01T12:00:00Z');

describe('isAdultOnFile', () => {
  it('accepts the age-gate confirmation', () => {
    expect(isAdultOnFile({ adult_confirmed_at: '2026-09-01T00:00:00Z' }, NOW)).toBe(true);
  });

  it('accepts a birth year at least 18 years back', () => {
    expect(isAdultOnFile({ birth_year: 2008 }, NOW)).toBe(true);
    expect(isAdultOnFile({ birth_year: 1990 }, NOW)).toBe(true);
  });

  it('rejects an under-18 birth year and missing data', () => {
    expect(isAdultOnFile({ birth_year: 2009 }, NOW)).toBe(false);
    expect(isAdultOnFile({}, NOW)).toBe(false);
    expect(isAdultOnFile(null, NOW)).toBe(false);
  });
});

describe('ComplianceService.hasAcceptedCurrentPolicies', () => {
  const accepted = {
    adult_confirmed_at: '2026-09-01T00:00:00Z',
    terms_accepted_at: '2026-09-01T00:00:00Z',
    terms_version: POLICY_VERSIONS.terms,
    community_guidelines_version: POLICY_VERSIONS.communityGuidelines,
  };

  it('is true when adult and the current versions are accepted', () => {
    expect(ComplianceService.hasAcceptedCurrentPolicies(accepted)).toBe(true);
  });

  it('is false without an 18+ confirmation', () => {
    expect(
      ComplianceService.hasAcceptedCurrentPolicies({ ...accepted, adult_confirmed_at: null }),
    ).toBe(false);
  });

  it('is false when an older policy version was accepted', () => {
    expect(ComplianceService.hasAcceptedCurrentPolicies({ ...accepted, terms_version: 'v0' })).toBe(
      false,
    );
    expect(
      ComplianceService.hasAcceptedCurrentPolicies({
        ...accepted,
        community_guidelines_version: 'v0',
      }),
    ).toBe(false);
  });

  it('is false when nothing was accepted', () => {
    expect(
      ComplianceService.hasAcceptedCurrentPolicies({ ...accepted, terms_accepted_at: null }),
    ).toBe(false);
    expect(ComplianceService.hasAcceptedCurrentPolicies(null)).toBe(false);
  });
});
