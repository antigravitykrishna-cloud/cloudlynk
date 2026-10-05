// What an account must have on file before it can use the app: an 18+ confirmation and acceptance
// of the current policy versions. Pure rules; the database enforces the same ones.

/**
 * Keep in step with current_policy_versions() in the database. Bump both when the Terms,
 * Guidelines or Privacy Policy change, and everyone is asked to accept again.
 */
export const POLICY_VERSIONS = {
  terms: 'v1',
  communityGuidelines: 'v1',
  privacy: 'v1',
} as const;

type AgeFields = {
  adult_confirmed_at?: string | null;
  birth_year?: number | null;
};

type AcceptanceFields = AgeFields & {
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  community_guidelines_version?: string | null;
};

/**
 * Whether the account has confirmed it is 18+: the age gate's answer (adult_confirmed_at), or,
 * for older accounts, a birth year entered at signup.
 */
export function isAdultOnFile(profile: AgeFields | null | undefined, now: Date = new Date()) {
  if (!profile) return false;
  if (profile.adult_confirmed_at) return true;
  return !!profile.birth_year && now.getFullYear() - profile.birth_year >= 18;
}

/**
 * Whether the account can use the app, or must first visit complete-profile. A UI pre-check: the
 * server re-checks (can_create_ugc) on every insert.
 */
export function hasAcceptedCurrentPolicies(profile: AcceptanceFields | null | undefined): boolean {
  if (!profile) return false;
  return (
    isAdultOnFile(profile) &&
    !!profile.terms_accepted_at &&
    profile.terms_version === POLICY_VERSIONS.terms &&
    profile.community_guidelines_version === POLICY_VERSIONS.communityGuidelines
  );
}
