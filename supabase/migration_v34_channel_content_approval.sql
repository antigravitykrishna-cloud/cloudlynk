-- PR-CHAN-ADMIN-CONTENT: Add content approval columns and SECURITY DEFINER functions.
-- The channel_posts table already has a 'status' column (draft/pending/approved/rejected)
-- and 'approved_by'/'approved_at'/'rejection_note' columns. We add an index and admin functions.

-- Index for efficient admin queries on pending content
CREATE INDEX IF NOT EXISTS idx_channel_posts_status_created
  ON channel_posts (status, created_at DESC);

-- SECURITY DEFINER function: approve channel content (admin only)
CREATE OR REPLACE FUNCTION approve_channel_content(content_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  UPDATE channel_posts
  SET status = 'approved',
      approved_at = now(),
      approved_by = auth.uid(),
      rejection_note = null
  WHERE id = content_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Content not found';
  END IF;
END;
$$;

-- SECURITY DEFINER function: reject channel content with reason (admin only)
CREATE OR REPLACE FUNCTION reject_channel_content(content_id uuid, reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  UPDATE channel_posts
  SET status = 'rejected',
      approved_at = now(),
      approved_by = auth.uid(),
      rejection_note = reason
  WHERE id = content_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Content not found';
  END IF;
END;
$$;

-- SECURITY DEFINER function: list pending content across all channels (admin only)
CREATE OR REPLACE FUNCTION admin_list_pending_content()
RETURNS TABLE (
  id uuid,
  channel_id uuid,
  channel_name text,
  owner_name text,
  title text,
  content_type text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT
    cp.id,
    cp.channel_id,
    c.name AS channel_name,
    p.full_name AS owner_name,
    cp.title,
    cp.content_type::text,
    cp.created_at
  FROM channel_posts cp
  JOIN channels c ON c.id = cp.channel_id
  JOIN profiles p ON p.id = c.owner_id
  WHERE cp.status = 'pending'
  ORDER BY cp.created_at ASC;
END;
$$;

-- SECURITY DEFINER function: list channel activity summary (admin only)
CREATE OR REPLACE FUNCTION admin_list_channel_activity()
RETURNS TABLE (
  channel_id uuid,
  channel_name text,
  owner_name text,
  member_count bigint,
  total_content bigint,
  pending_content bigint,
  last_upload timestamptz,
  channel_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT
    c.id AS channel_id,
    c.name AS channel_name,
    p.full_name AS owner_name,
    COALESCE(c.member_count, 0)::bigint AS member_count,
    COUNT(cp.id)::bigint AS total_content,
    COUNT(cp.id) FILTER (WHERE cp.status = 'pending')::bigint AS pending_content,
    MAX(cp.created_at) AS last_upload,
    c.status::text AS channel_status
  FROM channels c
  JOIN profiles p ON p.id = c.owner_id
  LEFT JOIN channel_posts cp ON cp.channel_id = c.id
  WHERE c.owner_id != auth.uid() OR true  -- all channels
  GROUP BY c.id, c.name, p.full_name, c.member_count, c.status
  ORDER BY pending_content DESC, last_upload DESC NULLS LAST;
END;
$$;

NOTIFY pgrst, 'reload schema';
