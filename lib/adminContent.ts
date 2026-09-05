import { supabase } from './supabase';
import { AccessLevel, ContentType } from './posts';

// Client wrappers for the v56 Admin Content & Access Panel.
//
// Every write here goes through a SECURITY DEFINER RPC that re-verifies
// is_admin in the database. The screens' isAdmin checks are UX only — this
// module is not a security boundary either, it is just the typed surface the
// admin screens call.
//
// Two kinds of access, deliberately kept apart (see the v56 migration):
//   PAID PREMIUM — a subscriber sees everything marked premium.
//   ADMIN GRANT  — one named person, one named post, no subscription.
// Nothing in this file writes plan_status, and revoking a grant never
// touches a paid entitlement.

/** Statuses the admin panel can set. Matches channel_posts_status_check. */
export type AdminPostStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'removed';

export type AdminPost = {
  id: string;
  title: string | null;
  body: string | null;
  status: AdminPostStatus;
  access_level: AccessLevel;
  content_type: ContentType;
  genre: string | null;
  duration_min: number | null;
  video_url: string | null;
  thumbnail_url: string | null;
  channel_id: string;
  created_at: string;
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  plan_status: string | null;
  plan_expires_at: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  account_status: 'active' | 'suspended' | 'banned';
  created_at: string;
};

export type PostGrantee = {
  grant_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  starts_at: string;
  expires_at: string | null;
  status: 'active' | 'revoked';
  reason: string | null;
  granted_by: string | null;
  granted_by_email: string | null;
  created_at: string;
};

export type UserGrant = {
  grant_id: string;
  post_id: string;
  post_title: string | null;
  access_level: AccessLevel;
  starts_at: string;
  expires_at: string | null;
  status: 'active' | 'revoked';
  reason: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  admin_id: string;
  admin_email: string | null;
  admin_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const AdminContentService = {
  /**
   * The first-party channel admin uploads go to. Found by the is_official
   * flag rather than a hardcoded id, so more official channels can exist
   * later without a code change. Returns null when the v56 seed was skipped
   * (no admin profile existed at migration time).
   *
   * A direct select is fine here: channels has an "Admins see all channels"
   * SELECT policy.
   */
  async getOfficialChannel(): Promise<{ id: string; name: string } | null> {
    const { data, error } = await supabase
      .from('channels')
      .select('id, name')
      .eq('is_official', true)
      .order('created_at')
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  },

  /**
   * Admin content list.
   *
   * Deliberately a direct table select, not a SECURITY DEFINER reader:
   * channel_posts_select_v56 carries a top-level
   * `EXISTS (... profiles.is_admin = true)` branch, so an admin already
   * reads every post regardless of status, channel or access level. This is
   * unlike public.profiles, which has no such branch and does need readers.
   */
  async listPosts(opts?: { status?: AdminPostStatus | 'all'; accessLevel?: AccessLevel | 'all' }): Promise<AdminPost[]> {
    let q = supabase
      .from('channel_posts')
      .select('id, title, body, status, access_level, content_type, genre, duration_min, video_url, thumbnail_url, channel_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (opts?.status && opts.status !== 'all') q = q.eq('status', opts.status);
    if (opts?.accessLevel && opts.accessLevel !== 'all') q = q.eq('access_level', opts.accessLevel);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AdminPost[];
  },

  async searchUsers(query?: string, limit = 50): Promise<AdminUser[]> {
    const { data, error } = await supabase.rpc('admin_search_users', {
      p_query: query?.trim() ? query.trim() : null,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as AdminUser[];
  },

  async getProfilesByIds(ids: string[]): Promise<{ id: string; email: string; full_name: string | null; username: string | null }[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.rpc('admin_get_profiles_by_ids', { p_ids: ids });
    if (error) throw error;
    return (data ?? []) as { id: string; email: string; full_name: string | null; username: string | null }[];
  },

  async getPostGrantees(postId: string): Promise<PostGrantee[]> {
    const { data, error } = await supabase.rpc('admin_get_post_grantees', { p_post_id: postId });
    if (error) throw error;
    return (data ?? []) as PostGrantee[];
  },

  async getUserGrants(userId: string): Promise<UserGrant[]> {
    const { data, error } = await supabase.rpc('admin_get_user_grants', { p_user_id: userId });
    if (error) throw error;
    return (data ?? []) as UserGrant[];
  },

  /** Grants one post to one person. Never touches plan_status. */
  async grantAccess(userId: string, postId: string, expiresAt: string | null, reason: string | null): Promise<void> {
    const { error } = await supabase.rpc('admin_grant_content_access', {
      p_user_id: userId,
      p_post_id: postId,
      p_expires_at: expiresAt,
      p_reason: reason,
    });
    if (error) throw error;
  },

  /**
   * Marks the grant revoked. The row is kept — the history is the point —
   * and a paid subscription is never affected.
   */
  async revokeAccess(userId: string, postId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_revoke_content_access', {
      p_user_id: userId,
      p_post_id: postId,
    });
    if (error) throw error;
  },

  async setPostStatus(postId: string, status: AdminPostStatus): Promise<void> {
    const { error } = await supabase.rpc('admin_set_post_status', {
      p_post_id: postId,
      p_status: status,
    });
    if (error) throw error;
  },

  /**
   * Changes a post's access level.
   *
   * Goes through the `stream-set-access` EDGE FUNCTION rather than calling
   * admin_set_post_access_level directly, and that is not optional. Flipping
   * premium -> free also has to unlock the video on Cloudflare: v54's
   * stream-playback-token permanently sets requireSignedURLs=true on first
   * premium play, and free playback uses a plain unsigned URL that a locked
   * video rejects. Change only the database and the post looks free while
   * its player is dead for everyone, with no diagnosable error.
   *
   * The function unlocks Cloudflare first and only then changes the level,
   * so a failed unlock leaves the post premium and reports an error rather
   * than silently half-applying.
   */
  async setPostAccessLevel(postId: string, accessLevel: AccessLevel): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stream-set-access`;
    let res: Response;
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId, accessLevel }),
      });
    } catch {
      throw new Error('Could not reach the video service. The access level was not changed.');
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error ?? 'Could not change the access level.');
  },

  async listAuditLog(limit = 100, targetType?: string): Promise<AuditEntry[]> {
    const { data, error } = await supabase.rpc('admin_list_audit_log', {
      p_limit: limit,
      p_target_type: targetType ?? null,
    });
    if (error) throw error;
    return (data ?? []) as AuditEntry[];
  },
};

/** Human-readable labels for admin_audit_log.action values. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  access_granted: 'Granted access',
  access_revoked: 'Revoked access',
  access_level_changed: 'Changed access level',
  post_status_changed: 'Changed post status',
};
