-- v56: Admin Content & Access Panel.
--
-- ═══════════════════════════════════════════════════════════════
-- TWO KINDS OF ACCESS — DO NOT CONFLATE THEM
-- ═══════════════════════════════════════════════════════════════
--
--   PAID PREMIUM — a subscriber (plan_status 'active'/'lifetime')
--     automatically sees everything marked access_level='premium'.
--   ADMIN GRANT  — one named person gets one named post, whether or not
--     they pay for anything. That is content_access_grants, below.
--
-- They are separate systems that feed ONE authorization decision. A grant
-- must never touch plan_status, and revoking a grant must never revoke or
-- downgrade a paid subscription — admin_revoke_content_access deliberately
-- only flips a grant row's status. This is the same line v55 holds for the
-- approval gate: admin control over who sees what never reaches into what
-- somebody has already paid for.
--
-- Grants are PER POST in this version. No channel-level, group or
-- role-based grants — the requirement is "let this person watch this video".

-- ═══════════════════════════════════════════════════════════════
-- 1. Official channel — somewhere for first-party content to live
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.channels.is_official IS
  'Marks a first-party Cloudlynk channel (admin-uploaded content) as opposed to a user-created one. A flag rather than a hardcoded UUID so more official channels can exist later without a code change.';

CREATE INDEX IF NOT EXISTS idx_channels_is_official
  ON public.channels(is_official) WHERE is_official = true;

-- Seed exactly one official channel, owned by the earliest admin.
--
-- Idempotent: guarded on "no official channel exists yet", so re-running the
-- migration cannot create a second one. If there is no admin profile at
-- migration time the seed is skipped rather than failing the migration —
-- the channel then has to be created once an admin exists.
--
-- The channel_members row is NOT optional. channel_posts' INSERT policy
-- ("Eligible members can post") requires an EXISTS on channel_members for
-- the target channel, so without it the admin could not post to their own
-- official channel and every admin upload would fail on RLS.
DO $$
DECLARE
  v_admin_id uuid;
  v_channel_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.channels WHERE is_official = true) THEN
    RETURN;
  END IF;

  SELECT id INTO v_admin_id
  FROM public.profiles
  WHERE is_admin = true
  ORDER BY created_at
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'v56: no admin profile found — official channel not seeded. Create it once an admin exists.';
    RETURN;
  END IF;

  INSERT INTO public.channels (owner_id, name, description, is_public, status, is_official)
  VALUES (
    v_admin_id,
    'Cloudlynk Official',
    'Movies, series and shorts published by Cloudlynk.',
    true,
    'active',
    true
  )
  RETURNING id INTO v_channel_id;

  INSERT INTO public.channel_members (channel_id, user_id, role)
  VALUES (v_channel_id, v_admin_id, 'owner')
  ON CONFLICT DO NOTHING;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. Pre-existing bug: 'draft' was never a legal status
-- ═══════════════════════════════════════════════════════════════
--
-- lib/posts.ts createPost() writes `status: 'draft'` when saveAsDraft is
-- set, but channel_posts_status_check only permitted
-- ('pending','approved','rejected','removed') — so every save-as-draft
-- insert has been failing on the constraint. The admin upload screen needs
-- draft/publish, so the value is added here rather than working around it.
ALTER TABLE public.channel_posts DROP CONSTRAINT IF EXISTS channel_posts_status_check;
ALTER TABLE public.channel_posts
  ADD CONSTRAINT channel_posts_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'removed'));

-- ═══════════════════════════════════════════════════════════════
-- 3. content_access_grants — "this person may watch this post"
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.content_access_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id     uuid NOT NULL REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  granted_by  uuid NOT NULL REFERENCES public.profiles(id),
  reason      text,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

COMMENT ON TABLE public.content_access_grants IS
  'Per-post access granted by an admin to a named user, independent of any subscription. Never implies or affects plan_status; revoking a grant must never touch a paid entitlement.';

-- (user_id, post_id) lookups are served by the UNIQUE constraint's index.
-- This one backs the "who can see this post" screen.
CREATE INDEX IF NOT EXISTS idx_content_access_grants_post ON public.content_access_grants(post_id);

ALTER TABLE public.content_access_grants ENABLE ROW LEVEL SECURITY;

-- Exactly one policy: you may read your own grants. There is deliberately
-- NO client INSERT/UPDATE/DELETE policy — with RLS enabled and no policy,
-- every client write is refused. All writes go through the SECURITY DEFINER
-- RPCs below, which verify is_admin themselves.
DROP POLICY IF EXISTS "Users read own grants" ON public.content_access_grants;
CREATE POLICY "Users read own grants"
  ON public.content_access_grants FOR SELECT
  USING (user_id = auth.uid());

-- The single definition of "holds a grant". Both the RLS policy on
-- channel_posts and the stream-playback-token edge function call THIS —
-- neither reimplements the condition, so they cannot drift apart.
--
-- account_status is checked here on purpose: a grant must not hand access
-- to a suspended or banned viewer, and putting it inside the helper makes
-- that hold in every caller at once.
CREATE OR REPLACE FUNCTION public.has_content_access(p_post_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.content_access_grants g
    JOIN public.profiles p ON p.id = g.user_id
    WHERE g.post_id = p_post_id
      AND g.user_id = p_user_id
      AND g.status = 'active'
      AND g.starts_at <= now()
      AND (g.expires_at IS NULL OR g.expires_at > now())
      AND p.account_status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_content_access(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.has_content_access(uuid, uuid) IS
  'True when this user holds a live admin grant for this post. Single source of truth for grant checks — called by channel_posts_select_v56 and by the stream-playback-token edge function so the feed and the player can never disagree.';

-- ═══════════════════════════════════════════════════════════════
-- 4. channel_posts SELECT policy — teach it about grants
-- ═══════════════════════════════════════════════════════════════
--
-- Recreated from the CURRENTLY DEPLOYED definition of
-- channel_posts_select_v52 (read out of pg_policies, not the v52 file).
-- Every clause is preserved verbatim — author-sees-own, admin-sees-all,
-- approved-only, author-not-suspended, blocker/blocked exclusion, channel
-- membership or public+active channel. The ONLY change is the final
-- entitlement clause, which gains the grant check.
--
-- The old policy is dropped in the same migration: two overlapping SELECT
-- policies would OR together and quietly widen access.

CREATE POLICY channel_posts_select_v56
  ON public.channel_posts FOR SELECT
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
    OR (
      status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles ap
        WHERE ap.id = channel_posts.author_id AND ap.account_status <> 'active'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE b.blocker_id = auth.uid() AND b.blocked_id = channel_posts.author_id
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.channel_members
          WHERE channel_members.channel_id = channel_posts.channel_id
            AND channel_members.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.channels
          WHERE channels.id = channel_posts.channel_id
            AND channels.is_public = true
            AND channels.status = 'active'
        )
      )
      -- Entitled to this post's access level: free, a paid subscription, or
      -- an explicit admin grant for this exact post (v56).
      AND (
        access_level = 'free'
        OR EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.plan_status IN ('active', 'lifetime')
        )
        OR public.has_content_access(channel_posts.id, auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS channel_posts_select_v52 ON public.channel_posts;

-- ═══════════════════════════════════════════════════════════════
-- 5. admin_audit_log — who did what
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES public.profiles(id),
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   uuid,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only record of admin actions. Written by SECURITY DEFINER RPCs and read by admin_list_audit_log — RLS is on with no policies at all, so no client can read or write it directly.';

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON public.admin_audit_log(target_type, target_id);

-- RLS on, zero policies: unreachable from any client key.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- 6. Admin readers (TRAP 3)
-- ═══════════════════════════════════════════════════════════════
--
-- public.profiles' only SELECT policy is `auth.uid() = id`, so an admin
-- querying other people's rows silently gets nothing back — no error, just
-- an empty result. (That is why app/admin/reports.tsx shows 'Unknown' for
-- every reporter.) The fix is deliberately NOT a blanket admin SELECT
-- policy on profiles: these SECURITY DEFINER readers expose exactly the
-- columns the admin screens render and nothing more, following
-- admin_list_user_approvals from v55.
--
-- Nothing here reads auth.users. No tokens, no password hashes.

CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 50
) RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  plan_status text,
  plan_expires_at timestamptz,
  approval_status text,
  account_status text,
  created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.plan_status, p.plan_expires_at,
         p.approval_status, p.account_status, p.created_at
  FROM public.profiles p
  WHERE p_query IS NULL
     OR btrim(p_query) = ''
     OR p.email ILIKE '%' || btrim(p_query) || '%'
     OR coalesce(p.full_name, '') ILIKE '%' || btrim(p_query) || '%'
  ORDER BY p.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_users(text, int) TO authenticated;

-- Resolve a specific set of profile ids. admin_search_users could be made to
-- do this by fetching everyone and mapping client-side, but that silently
-- stops working once there are more users than its limit. Screens that
-- already know which ids they need (app/admin/reports.tsx resolving reporter
-- and reported-user names) should use this instead.
CREATE OR REPLACE FUNCTION public.admin_get_profiles_by_ids(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  username text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.username
  FROM public.profiles p
  WHERE p.id = ANY(coalesce(p_ids, ARRAY[]::uuid[]));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_profiles_by_ids(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_post_grantees(p_post_id uuid)
RETURNS TABLE (
  grant_id uuid,
  user_id uuid,
  email text,
  full_name text,
  starts_at timestamptz,
  expires_at timestamptz,
  status text,
  reason text,
  granted_by uuid,
  granted_by_email text,
  created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, g.user_id, p.email, p.full_name, g.starts_at, g.expires_at,
         g.status, g.reason, g.granted_by, gb.email, g.created_at
  FROM public.content_access_grants g
  JOIN public.profiles p ON p.id = g.user_id
  LEFT JOIN public.profiles gb ON gb.id = g.granted_by
  WHERE g.post_id = p_post_id
  ORDER BY g.status, g.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_post_grantees(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_user_grants(p_user_id uuid)
RETURNS TABLE (
  grant_id uuid,
  post_id uuid,
  post_title text,
  access_level text,
  starts_at timestamptz,
  expires_at timestamptz,
  status text,
  reason text,
  created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, g.post_id, cp.title, cp.access_level, g.starts_at, g.expires_at,
         g.status, g.reason, g.created_at
  FROM public.content_access_grants g
  JOIN public.channel_posts cp ON cp.id = g.post_id
  WHERE g.user_id = p_user_id
  ORDER BY g.status, g.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_grants(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_audit_log(
  p_limit int DEFAULT 100,
  p_target_type text DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  admin_id uuid,
  admin_email text,
  admin_name text,
  action text,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.id, l.admin_id, p.email, p.full_name, l.action, l.target_type,
         l.target_id, l.metadata, l.created_at
  FROM public.admin_audit_log l
  LEFT JOIN public.profiles p ON p.id = l.admin_id
  WHERE p_target_type IS NULL OR l.target_type = p_target_type
  ORDER BY l.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_audit_log(int, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 7. Admin write RPCs — the actual security boundary
-- ═══════════════════════════════════════════════════════════════
--
-- Every one re-verifies is_admin internally. The screens' isAdmin checks
-- are UX only, exactly as with admin_set_user_approval (v55).
--
-- None of these write to public.profiles, so none needs to set
-- app.trusted_update — the privileged-fields guard trigger only fires on
-- UPDATE of that table. That is deliberate: an access grant has no business
-- touching a profile row at all.

CREATE OR REPLACE FUNCTION public.admin_grant_content_access(
  p_user_id uuid,
  p_post_id uuid,
  p_expires_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = p_user_id) THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.channel_posts WHERE channel_posts.id = p_post_id) THEN
    RAISE EXCEPTION 'Post % not found', p_post_id;
  END IF;

  -- Upsert on the (user_id, post_id) unique key: re-granting something that
  -- was previously revoked reactivates that row rather than erroring, and
  -- keeps the original created_at so the history stays readable.
  INSERT INTO public.content_access_grants (user_id, post_id, granted_by, reason, expires_at, status)
  VALUES (p_user_id, p_post_id, auth.uid(), p_reason, p_expires_at, 'active')
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET status = 'active',
        granted_by = auth.uid(),
        reason = EXCLUDED.reason,
        starts_at = now(),
        expires_at = EXCLUDED.expires_at;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'access_granted', 'post', p_post_id,
          jsonb_build_object('user_id', p_user_id, 'expires_at', p_expires_at, 'reason', p_reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_grant_content_access(uuid, uuid, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revoke_content_access(
  p_user_id uuid,
  p_post_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  -- Flip the status, never DELETE — the history is the point of the table.
  -- plan_status is deliberately untouched: revoking a grant must not disturb
  -- a subscription the user has actually paid for.
  UPDATE public.content_access_grants
  SET status = 'revoked'
  WHERE user_id = p_user_id AND post_id = p_post_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No grant found for that user and post';
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'access_revoked', 'post', p_post_id,
          jsonb_build_object('user_id', p_user_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_revoke_content_access(uuid, uuid) TO authenticated;

-- Flipping premium -> free ALSO requires unlocking the Cloudflare video
-- (see TRAP 2 / the stream-set-access edge function). Postgres cannot call
-- Cloudflare, so the app layer drives that: the admin screen calls the edge
-- function, which unlocks Cloudflare FIRST and only then calls this RPC.
-- Do not call this directly from a screen for a premium -> free change.
CREATE OR REPLACE FUNCTION public.admin_set_post_access_level(
  p_post_id uuid,
  p_access_level text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_access_level NOT IN ('free', 'premium') THEN
    RAISE EXCEPTION 'Invalid access level: %', p_access_level USING ERRCODE = '22023';
  END IF;

  SELECT access_level INTO v_old FROM public.channel_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post % not found', p_post_id;
  END IF;

  UPDATE public.channel_posts SET access_level = p_access_level WHERE id = p_post_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'access_level_changed', 'post', p_post_id,
          jsonb_build_object('from', v_old, 'to', p_access_level));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_post_access_level(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_post_status(
  p_post_id uuid,
  p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  -- Matches channel_posts_status_check as amended in section 2 above.
  IF p_status NOT IN ('draft', 'pending', 'approved', 'rejected', 'removed') THEN
    RAISE EXCEPTION 'Invalid post status: %', p_status USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_old FROM public.channel_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post % not found', p_post_id;
  END IF;

  UPDATE public.channel_posts
  SET status = p_status,
      submitted_at = CASE WHEN p_status = 'draft' THEN NULL
                          ELSE coalesce(submitted_at, now()) END
  WHERE id = p_post_id;

  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'post_status_changed', 'post', p_post_id,
          jsonb_build_object('from', v_old, 'to', p_status));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_post_status(uuid, text) TO authenticated;

-- Used by the stream-set-access edge function to reset the Cloudflare
-- signed-URL cache flag when a post goes premium -> free (TRAP 2). Admin
-- only; stream_videos is otherwise service-role territory.
CREATE OR REPLACE FUNCTION public.admin_clear_signed_lock(p_stream_uid text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.stream_videos SET signed_locked = false WHERE stream_uid = p_stream_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_signed_lock(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
