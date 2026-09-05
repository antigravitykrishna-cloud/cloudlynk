-- Follow-up to v39: tighten GRANTs on storage counter RPCs to match record_post_view pattern
-- (anon gets blocked at the function body anyway, but cleaner to revoke the GRANT too)

revoke execute on function public.increment_storage_used(uuid, bigint) from PUBLIC, anon;
grant execute on function public.increment_storage_used(uuid, bigint) to authenticated;

revoke execute on function public.decrement_storage_used(uuid, bigint) from PUBLIC, anon;
grant execute on function public.decrement_storage_used(uuid, bigint) to authenticated;

NOTIFY pgrst, 'reload schema';