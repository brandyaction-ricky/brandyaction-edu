begin;

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create or replace function public.edu_delete_member(p_actor uuid, p_member uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  active_admins integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor and role = 'admin' and status = 'active'
  ) then
    raise exception '관리자 권한이 필요합니다.';
  end if;
  if p_actor = p_member then
    raise exception '현재 로그인한 관리자 계정은 삭제할 수 없습니다.';
  end if;

  select * into target from public.profiles where id = p_member for update;
  if not found or target.status = 'withdrawn' then
    raise exception '삭제할 회원을 찾을 수 없습니다.';
  end if;

  if target.role = 'admin' then
    select count(*) into active_admins
    from public.profiles
    where role = 'admin' and status = 'active';
    if active_admins <= 1 then
      raise exception '최소 한 명의 활성 관리자가 필요합니다.';
    end if;
  end if;

  update public.profiles
  set
    email = 'deleted+' || replace(id::text, '-', '') || '@invalid.local',
    full_name = '삭제된 회원',
    phone = null,
    avatar_url = null,
    marketing_consent = false,
    role = 'student',
    status = 'withdrawn',
    deleted_at = now(),
    updated_at = now()
  where id = p_member;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_actor,
    'member.deleted',
    'profile',
    p_member::text,
    jsonb_build_object('role', target.role, 'status', target.status),
    jsonb_build_object('role', 'student', 'status', 'withdrawn')
  );
  return true;
end;
$$;

revoke all on function public.edu_delete_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.edu_delete_member(uuid, uuid) to service_role;

commit;
