create or replace function public.edu_restore_products(p_actor uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_actor
      and role = 'admin'
      and status = 'active'
  ) then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  if cardinality(p_ids) not between 1 and 50 then
    raise exception '복원할 상품을 최대 50개까지 선택해 주세요.';
  end if;

  update public.courses
  set archived_at = null,
      status = 'draft',
      updated_at = now()
  where id = any(p_ids)
    and archived_at is not null;

  get diagnostics affected = row_count;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (
    p_actor,
    'course.restored',
    'course',
    null,
    jsonb_build_object('ids', p_ids, 'count', affected, 'status', 'draft')
  );

  return affected;
end;
$$;

revoke all on function public.edu_restore_products(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.edu_restore_products(uuid, uuid[]) to service_role;
