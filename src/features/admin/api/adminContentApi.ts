import { callEdgeFunction } from '@/lib/edgeFunctions';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/utils/errors';
import type { AccessLevel, ContentType } from '@/features/content/model';

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
  const code = (err as { code?: string } | null)?.code ?? '';
  if (code === 'PGRST202' || code === '42883') {
    return new Error(
      `${feature} is not available yet — the backend migration for it has not been deployed. ` +
        `Everything else in the admin panel works normally.`,
    );
  }
  return new Error(errorMessage(err, 'Something went wrong.'));
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

/** The fields of a post an admin can edit in place. Absent means "leave as it is". */
export type PostPatch = {
  title?: string;
  body?: string;
  genre?: string;
  durationMin?: number;
  releaseYear?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  thumbnailUrl?: string;
};

export const adminContentApi = {
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

  async getPostGrantees(postId: string): Promise<PostGrantee[]> {
    const { data, error } = await supabase.rpc('admin_get_post_grantees', { p_post_id: postId });
    if (error) throw error;
    return (data ?? []) as PostGrantee[];
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
    const res = await callEdgeFunction(
      'stream-set-access',
      { postId, accessLevel },
      {
        unreachableMessage: 'Could not reach the video service. The access level was not changed.',
      },
    );
    if (!res.ok) throw new Error(res.data?.error ?? 'Could not change the access level.');
  },

  /**
   * Edit a post in place. `patch` holds the changed fields; `clearFields` names fields to set back
   * to NULL, so blanking is always deliberate. Keeping the post id keeps its access grants. Access
   * level and status have their own paths (see setPostAccessLevel).
   */
  async updatePost(
    postId: string,
    patch: PostPatch,
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
    const res = await callEdgeFunction<{ previousUid?: string | null }>(
      'admin-replace-video',
      { postId, newUid },
      {
        unreachableMessage: 'Could not reach the video service. The post still uses its old video.',
      },
    );
    if (res.status === 404 && !res.data?.error) {
      // A deployed function answering about a missing post sends its own error; a bare 404 means
      // the function itself is not deployed.
      throw new Error(
        'Replacing videos is not available yet — the admin-replace-video function has not been deployed.',
      );
    }
    if (!res.ok) throw new Error(res.data?.error ?? 'Could not replace the video.');
    return { previousUid: res.data?.previousUid ?? null };
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
