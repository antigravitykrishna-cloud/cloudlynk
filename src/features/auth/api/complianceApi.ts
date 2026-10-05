import { supabase } from '@/lib/supabase';
import { POLICY_VERSIONS } from '@/features/auth/policies';

export const complianceApi = {
  /** Records acceptance of the current policy versions. Call at signup and after a version bump. */
  async acceptCurrentPolicies(): Promise<void> {
    const { error } = await supabase.rpc('accept_terms', {
      p_terms_version: POLICY_VERSIONS.terms,
      p_community_guidelines_version: POLICY_VERSIONS.communityGuidelines,
      p_privacy_version: POLICY_VERSIONS.privacy,
    });
    if (error) throw error;
  },

  /** Records the person's "I am 18 or older" answer on their account. */
  async confirmAdult(): Promise<void> {
    const { error } = await supabase.rpc('confirm_adult');
    if (error) throw error;
  },
};
