import { supabase } from '@/lib/supabase';
import { AdminContentService } from '@/features/admin/api/adminContentApi';

// The moderation queue for reports filed from the app (a post, a user, a copyright claim). Every
// action re-checks is_admin on the server.

export type ReportTargetType = 'content' | 'user' | 'copyright' | 'other';
export type ModerationAction =
  'dismiss' | 'remove_content' | 'suspend_channel' | 'suspend_user' | 'ban_user' | 'warn';

export type ContentReport = {
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
};

/** A report with the names an admin needs to read it. */
export type PendingReport = ContentReport & {
  reporterName: string;
  reportedUserName: string | null;
  postTitle: string | null;
};

const unique = <T>(values: (T | null | undefined)[]): T[] => [
  ...new Set(values.filter((v): v is T => v != null)),
];

export const adminReportsApi = {
  /** Open reports, oldest first, with reporter / reported-user names and the post title. */
  async listPending(): Promise<PendingReport[]> {
    const { data, error } = await supabase
      .from('content_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    const reports = (data ?? []) as ContentReport[];

    const profileIds = unique(reports.flatMap(r => [r.reporter_id, r.reported_user_id]));
    const postIds = unique(reports.map(r => r.post_id));

    // Names come from admin_get_profiles_by_ids (admin-only): profiles are otherwise readable only
    // by their owner, so a direct select would return nothing.
    const [profiles, posts] = await Promise.all([
      AdminContentService.getProfilesByIds(profileIds),
      postIds.length
        ? supabase.from('channel_posts').select('id, title').in('id', postIds)
        : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    ]);

    const nameById = new Map(
      profiles.map(p => [p.id, p.full_name || p.username || p.email || 'Unknown']),
    );
    const titleById = new Map((posts.data ?? []).map(p => [p.id, p.title]));

    return reports.map(r => ({
      ...r,
      reporterName: nameById.get(r.reporter_id) ?? 'Unknown',
      reportedUserName: r.reported_user_id ? (nameById.get(r.reported_user_id) ?? 'Unknown') : null,
      postTitle: r.post_id ? (titleById.get(r.post_id) ?? null) : null,
    }));
  },

  /** Closes a report with an action (e.g. remove the post) and a note kept in the audit log. */
  async resolve(reportId: string, action: ModerationAction, note: string): Promise<void> {
    const { error } = await supabase.rpc('admin_resolve_report', {
      p_report_id: reportId,
      p_action: action,
      p_resolution: note,
      p_moderator_note: note,
    });
    if (error) throw error;
  },
};
