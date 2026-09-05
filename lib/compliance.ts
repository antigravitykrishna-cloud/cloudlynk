import { supabase } from './supabase';

/**
 * Client-side contract for the backend added in
 * supabase/migrations/20260825090000_v48_ugc_moderation_and_entitlements.sql.
 *
 * Keep POLICY_VERSIONS in sync with `current_policy_versions()` in that
 * migration — bump both together whenever Terms/Guidelines/Privacy change.
 * A user who accepted an older version will fail the server-side
 * `can_create_ugc` check the next time they try to create a channel or post,
 * so the front-end should re-prompt for acceptance whenever this differs
 * from what `profiles.terms_version`/`community_guidelines_version` holds.
 */
export const POLICY_VERSIONS = {
  terms: 'v1',
  communityGuidelines: 'v1',
  privacy: 'v1',
} as const;

export const ComplianceService = {
  /** Call once, at signup and whenever POLICY_VERSIONS changes and the user re-accepts. */
  async acceptTerms() {
    const { error } = await supabase.rpc('accept_terms', {
      p_terms_version: POLICY_VERSIONS.terms,
      p_community_guidelines_version: POLICY_VERSIONS.communityGuidelines,
      p_privacy_version: POLICY_VERSIONS.privacy,
    });
    if (error) throw error;
  },

  /**
   * Client-side pre-check so the UI can show "accept terms to continue"
   * instead of a raw RLS failure. The server independently re-checks this
   * via `can_create_ugc` on every channel/post INSERT — this is a UX
   * convenience, not the security boundary.
   */
  hasAcceptedCurrentPolicies(profile: {
    terms_accepted_at?: string | null;
    terms_version?: string | null;
    community_guidelines_version?: string | null;
    birth_year?: number | null;
  } | null): boolean {
    if (!profile) return false;
    const isAdult = !!profile.birth_year && new Date().getFullYear() - profile.birth_year >= 18;
    return (
      isAdult &&
      !!profile.terms_accepted_at &&
      profile.terms_version === POLICY_VERSIONS.terms &&
      profile.community_guidelines_version === POLICY_VERSIONS.communityGuidelines
    );
  },
};

export type ReportTargetType = 'content' | 'user' | 'copyright' | 'other';
export type ModerationAction = 'dismiss' | 'remove_content' | 'suspend_channel' | 'suspend_user' | 'ban_user' | 'warn';

export interface ContentReport {
  id: string;
  channel_id: string | null;
  post_id: string | null;
  reporter_id: string;
  reported_user_id: string | null;
  reason: string;
  target_type: ReportTargetType;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  resolution: string | null;
  moderator_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** Admin-only moderation queue actions. All server-verify `is_admin` independently. */
export const AdminModerationService = {
  async listPendingReports(): Promise<ContentReport[]> {
    const { data, error } = await supabase
      .from('content_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ContentReport[];
  },

  async resolveReport(
    reportId: string,
    action: ModerationAction,
    resolution: string,
    moderatorNote?: string,
  ) {
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report_id: reportId,
      p_action: action,
      p_resolution: resolution,
      p_moderator_note: moderatorNote ?? null,
    });
    if (error) throw error;
  },
};
