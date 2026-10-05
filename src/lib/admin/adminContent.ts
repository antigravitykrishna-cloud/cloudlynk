import { supabase } from '@/lib/supabase';
import { AccessLevel, ContentType } from '@/lib/data/posts';
import { errorCode, errorMessage } from '@/lib/errors';

// Client wrappers for the admin content and access panel. Every write is a SECURITY DEFINER RPC
// that re-checks is_admin; neither the screens nor this module are the security boundary. Two kinds
// of access are kept apart: a paid plan (everything premium) and an admin grant (one person, one
// post). Nothing here writes plan_status.

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

/**
 * Turns "this RPC does not exist on the server" (PGRST202 / 42883) into a message an admin can act
 * on, instead of a raw schema-cache error.
 */
function describeRpcError(err: unknown, feature: string): Error {
  const code = errorCode(err) ?? '';
  if (code === 'PGRST202' || code === '42883') {
    return new Error(
      `${feature} is not available yet — the backend migration for it has not been deployed. ` +
        `Everything else in the admin panel works normally.`,
    );
  }
  return new Error(errorMessage(err));
}

/** Fields admin_update_post may set back to NULL (mirrors its whitelist). */
export type PostClearableField =
  | 'body'
  | 'genre'
  | 'duration_min'
  | 'release_year'
  | 'season_number'
  | 'episode_number'
  | 'episode_title'
  | 'thumbnail_url';

export const AdminContentService = {
  /**
   * The official channel admin uploads go to, found by the is_official flag. Null if none exists. A
   * direct select is allowed for admins.
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
   * Admin content list. A direct select works: the posts read policy lets admins see every post.
   */
  async listPosts(opts?: {
    status?: AdminPostStatus | 'all';
    accessLevel?: AccessLevel | 'all';
  }): Promise<AdminPost[]> {
    let q = supabase
      .from('channel_posts')
      .select(
        'id, title, body, status, access_level, content_type, genre, duration_min, video_url, thumbnail_url, channel_id, created_at',
      )
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
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as AdminUser[];
  },

  async getProfilesByIds(
    ids: string[],
  ): Promise<{ id: string; email: string; full_name: string | null; username: string | null }[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.rpc('admin_get_profiles_by_ids', { p_ids: ids });
    if (error) throw error;
    return (data ?? []) as {
      id: string;
      email: string;
      full_name: string | null;
      username: string | null;
    }[];
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
  async grantAccess(
    userId: string,
    postId: string,
    expiresAt: string | null,
    reason: string | null,
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_grant_content_access', {
      p_user_id: userId,
      p_post_id: postId,
      p_expires_at: expiresAt ?? undefined,
      p_reason: reason ?? undefined,
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
   * Change a post's access level through the stream-set-access function. Going premium locks the
   * video on Cloudflare first, and the level only changes if that succeeded. Videos stay locked
   * when made free (free titles play through a token too).
   */
  async setPostAccessLevel(postId: string, accessLevel: AccessLevel): Promise<void> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
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

  /**
   * Edit a post in place. `patch` holds the changed fields; `clearFields` names fields to set back
   * to NULL, so blanking is always deliberate. Keeping the post id keeps its access grants. Access
   * level and status have their own paths (see setPostAccessLevel).
   */
  async updatePost(
    postId: string,
    patch: {
      title?: string;
      body?: string;
      genre?: string;
      durationMin?: number;
      releaseYear?: number;
      seasonNumber?: number;
      episodeNumber?: number;
      episodeTitle?: string;
      thumbnailUrl?: string;
    },
    clearFields?: PostClearableField[],
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_update_post', {
      p_post_id: postId,
      p_title: patch.title,
      p_body: patch.body,
      p_genre: patch.genre,
      p_duration_min: patch.durationMin,
      p_release_year: patch.releaseYear,
      p_season_number: patch.seasonNumber,
      p_episode_number: patch.episodeNumber,
      p_episode_title: patch.episodeTitle,
      p_thumbnail_url: patch.thumbnailUrl,
      p_clear_fields: clearFields,
    });
    if (error) throw describeRpcError(error, 'Editing posts');
  },

  /**
   * Swap the Cloudflare video behind a post, keeping the post id and its grants. Goes through the
   * admin-replace-video function so a premium post's new video is locked before it goes live.
   * `newUid` is the uid returned by a completed upload; the old video stays on Cloudflare (its uid
   * is in the audit log).
   */
  async replaceVideo(postId: string, newUid: string): Promise<{ previousUid: string | null }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-replace-video`;
    let res: Response;
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postId, newUid }),
      });
    } catch {
      throw new Error('Could not reach the video service. The post still uses its old video.');
    }

    const json = await res.json().catch(() => null);
    if (res.status === 404) {
      // The edge function itself is missing, not the post — a deployed
      // function answering about a missing post returns its own 404 body with
      // an `error` field, so distinguish on that.
      throw new Error(
        json?.error ??
          'Replacing videos is not available yet — the admin-replace-video function has not been deployed.',
      );
    }
    if (!res.ok) throw new Error(json?.error ?? 'Could not replace the video.');
    return { previousUid: json?.previousUid ?? null };
  },

  async listAuditLog(limit = 100, targetType?: string): Promise<AuditEntry[]> {
    const { data, error } = await supabase.rpc('admin_list_audit_log', {
      p_limit: limit,
      p_target_type: targetType,
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
  post_updated: 'Edited post',
  post_video_replaced: 'Replaced video',
};
