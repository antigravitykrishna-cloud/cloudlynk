-- Migration v38: Add view_count to channel_posts for Popular/Most Watched filters
-- Note: v0.6.0 does not deduplicate per-user views. Overcounting from
-- refreshes is acceptable — per-user dedup planned for v0.7.

ALTER TABLE public.channel_posts
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS channel_posts_view_count_idx
  ON public.channel_posts (view_count DESC);

create or replace function public.record_post_view(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.channel_posts
    set view_count = view_count + 1
    where id = p_post_id;
end;
$$;

grant execute on function public.record_post_view(uuid) to authenticated, anon;
NOTIFY pgrst, 'reload schema';
