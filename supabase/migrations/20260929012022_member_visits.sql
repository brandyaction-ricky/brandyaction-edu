begin;
-- One row per learner/Korean calendar day, not an authentication or pageview log.
create table public.edu_member_visits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  visit_day date not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (user_id, visit_day),
  check (last_seen_at >= first_seen_at),
  check ((first_seen_at at time zone 'Asia/Seoul')::date = visit_day),
  check ((last_seen_at at time zone 'Asia/Seoul')::date = visit_day)
);
create index edu_member_visits_day_idx on public.edu_member_visits(visit_day, last_seen_at desc, user_id);
alter table public.edu_member_visits enable row level security;
revoke all on public.edu_member_visits from public, anon, authenticated;
grant select, insert, update on public.edu_member_visits to service_role;

create function public.edu_record_member_visit(p_member uuid)
returns void language plpgsql volatile security invoker set search_path='' as $$
declare observed timestamptz := clock_timestamp();
begin
  if not exists(select 1 from public.profiles where id=p_member and status='active' and role='student')
    then raise exception 'VISIT_FORBIDDEN'; end if;
  insert into public.edu_member_visits(user_id,visit_day,first_seen_at,last_seen_at)
    values(p_member,(observed at time zone 'Asia/Seoul')::date,observed,observed)
    on conflict(user_id,visit_day) do update set last_seen_at=excluded.last_seen_at
    where public.edu_member_visits.last_seen_at < excluded.last_seen_at - interval '5 minutes';
end;
$$;

create function public.edu_admin_member_visits(p_actor uuid,p_member uuid default null,p_day date default null,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  perform public.edu_assert_block_reviewer(p_actor);
  if p_page is null or p_page not between 1 and 100000 or (p_member is null and p_day is null)
    or (p_member is not null and p_day is not null) then raise exception 'VISIT_INVALID'; end if;
  if p_member is not null and not exists(select 1 from public.profiles where id=p_member and status<>'withdrawn')
    then raise exception 'VISIT_NOT_FOUND'; end if;
  with filtered as materialized (
    select v.*,p.full_name,p.phone from public.edu_member_visits v join public.profiles p on p.id=v.user_id
      where p.status<>'withdrawn' and p.role='student'
        and (p_member is null or v.user_id=p_member) and (p_day is null or v.visit_day=p_day)
  ), page as (
    select * from filtered order by visit_day desc,last_seen_at desc,user_id limit 20 offset (p_page-1)*20
  ) select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object(
    'member',user_id,'name',coalesce(full_name,''),'phone',phone,'day',visit_day,
    'firstSeen',first_seen_at,'lastSeen',last_seen_at) order by visit_day desc,last_seen_at desc,user_id) from page),'[]'),
    'total',(select count(*) from filtered),'page',p_page,'pageSize',20,'day',p_day,'asOf',now()) into result;
  return result;
end;
$$;
revoke all on function public.edu_record_member_visit(uuid),public.edu_admin_member_visits(uuid,uuid,date,integer) from public,anon,authenticated;
grant execute on function public.edu_record_member_visit(uuid),public.edu_admin_member_visits(uuid,uuid,date,integer) to service_role;
commit;
