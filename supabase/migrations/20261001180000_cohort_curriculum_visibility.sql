begin;

-- Existing cohorts retain exactly the week/lesson publication they had before
-- this feature. A newly created cohort has no rows and therefore starts hidden.
create table public.edu_cohort_week_visibility (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  week_id uuid not null references public.curriculum_weeks(id) on delete cascade,
  is_published boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (cohort_id, week_id)
);
create index edu_cohort_week_visibility_week_idx on public.edu_cohort_week_visibility(week_id);
create table public.edu_cohort_lesson_visibility (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  lesson_id uuid not null references public.curriculum_lessons(id) on delete cascade,
  is_published boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (cohort_id, lesson_id)
);
create index edu_cohort_lesson_visibility_lesson_idx on public.edu_cohort_lesson_visibility(lesson_id);
alter table public.edu_cohort_week_visibility enable row level security;
alter table public.edu_cohort_lesson_visibility enable row level security;
revoke all on public.edu_cohort_week_visibility, public.edu_cohort_lesson_visibility from public, anon, authenticated;
grant select, insert, update on public.edu_cohort_week_visibility, public.edu_cohort_lesson_visibility to service_role;

insert into public.edu_cohort_week_visibility(cohort_id,week_id,is_published)
select c.id,w.id,w.is_published from public.cohorts c
join public.curriculum_weeks w on w.course_id=c.course_id;
insert into public.edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published)
select c.id,l.id,l.is_published from public.cohorts c
join public.curriculum_weeks w on w.course_id=c.course_id
join public.curriculum_lessons l on l.week_id=w.id;

-- The global publication flags remain the content-authoring gate. Cohort
-- publication narrows that gate; it can never reveal an unpublished draft.
create function edu_private.edu_cohort_week_visible(p_cohort uuid,p_week uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.cohorts c
    join public.curriculum_weeks w on w.course_id=c.course_id
    join public.edu_cohort_week_visibility v on v.cohort_id=c.id and v.week_id=w.id
    where c.id=p_cohort and w.id=p_week and w.is_published and w.archived_at is null
      and v.is_published);
$$;
create function edu_private.edu_cohort_lesson_visible(p_cohort uuid,p_lesson uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.curriculum_lessons l
    join public.curriculum_weeks w on w.id=l.week_id
    join public.cohorts c on c.course_id=w.course_id
    join public.edu_cohort_week_visibility wv on wv.cohort_id=c.id and wv.week_id=w.id
    join public.edu_cohort_lesson_visibility lv on lv.cohort_id=c.id and lv.lesson_id=l.id
    where c.id=p_cohort and l.id=p_lesson and w.is_published and l.is_published
      and w.archived_at is null and l.archived_at is null and wv.is_published and lv.is_published);
$$;
revoke all on function edu_private.edu_cohort_week_visible(uuid,uuid), edu_private.edu_cohort_lesson_visible(uuid,uuid) from public,anon;
grant execute on function edu_private.edu_cohort_week_visible(uuid,uuid), edu_private.edu_cohort_lesson_visible(uuid,uuid) to authenticated,service_role;

create function public.edu_cohort_lesson_visible(p_cohort uuid,p_lesson uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select edu_private.edu_cohort_lesson_visible(p_cohort,p_lesson);
$$;
revoke all on function public.edu_cohort_lesson_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_cohort_lesson_visible(uuid,uuid) to service_role;

-- Direct PostgREST reads of bodies and missions must obey cohort visibility,
-- even when the caller bypasses the Next.js member-data route.
create function edu_private.edu_member_lesson_visible(p_lesson uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then return false; end if;
  if exists(select 1 from public.profiles p where p.id=actor and p.status='active'
    and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s
      where s.key='edu_staff_permissions_'||p.id::text
        and (s.value->'products'='true'::jsonb or s.value->'members'='true'::jsonb))))) then return true; end if;
  return exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.user_id=actor and p.status='active' and e.status='active' and e.revoked_at is null
      and (e.access_starts_at is null or e.access_starts_at<=now())
      and (e.access_ends_at is null or e.access_ends_at>now())
      and edu_private.edu_cohort_lesson_visible(e.cohort_id,p_lesson));
end;
$$;
revoke all on function edu_private.edu_member_lesson_visible(uuid) from public,anon;
grant execute on function edu_private.edu_member_lesson_visible(uuid) to authenticated,service_role;
create function edu_private.edu_member_week_visible(p_week uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then return false; end if;
  if exists(select 1 from public.profiles p where p.id=actor and p.status='active'
    and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s
      where s.key='edu_staff_permissions_'||p.id::text
        and (s.value->'products'='true'::jsonb or s.value->'members'='true'::jsonb))))) then return true; end if;
  return exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.user_id=actor and p.status='active' and e.status='active' and e.revoked_at is null
      and (e.access_starts_at is null or e.access_starts_at<=now())
      and (e.access_ends_at is null or e.access_ends_at>now())
      and edu_private.edu_cohort_week_visible(e.cohort_id,p_week));
end;
$$;
revoke all on function edu_private.edu_member_week_visible(uuid) from public,anon;
grant execute on function edu_private.edu_member_week_visible(uuid) to authenticated,service_role;
-- The marketing catalog uses anon with only globally published titles. An
-- authenticated learner's direct table read is limited to their own cohort.
create policy cohort_visible_curriculum_weeks on public.curriculum_weeks as restrictive
  for select to authenticated using (edu_private.edu_member_week_visible(id));
create policy cohort_visible_curriculum_lessons on public.curriculum_lessons as restrictive
  for select to authenticated using (edu_private.edu_member_lesson_visible(id));
create policy cohort_visible_lesson_contents on public.lesson_contents as restrictive
  for select to authenticated using (edu_private.edu_member_lesson_visible(lesson_id));
create policy cohort_visible_curriculum_missions on public.curriculum_missions as restrictive
  for select to authenticated using (edu_private.edu_member_lesson_visible(lesson_id));

-- Serialize all changes for one cohort and reject stale checkboxes. A failed
-- save rolls the whole batch back instead of partially exposing a week.
create function public.edu_save_cohort_curriculum_visibility(p_actor uuid,p_cohort uuid,p_changes jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare course uuid; item jsonb; target uuid; kind text; expected boolean; next_value boolean; old_value boolean; item_count integer;
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active'
    and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s
      where s.key='edu_staff_permissions_'||p.id::text and s.value->'products'='true'::jsonb))))
    then raise exception 'COHORT_VISIBILITY_FORBIDDEN'; end if;
  select c.course_id into course from public.cohorts c where c.id=p_cohort for update;
  if course is null then raise exception 'COHORT_VISIBILITY_NOT_FOUND'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'COHORT_VISIBILITY_INVALID'; end if;
  item_count:=jsonb_array_length(p_changes);
  if item_count<1 or item_count>400 then raise exception 'COHORT_VISIBILITY_INVALID'; end if;
  for item in select value from jsonb_array_elements(p_changes) loop
    kind:=item->>'kind';
    if kind is null or kind not in ('week','lesson') or (item->>'id') is null
      or jsonb_typeof(item->'expected') is distinct from 'boolean'
      or jsonb_typeof(item->'published') is distinct from 'boolean'
      then raise exception 'COHORT_VISIBILITY_INVALID'; end if;
    begin target:=(item->>'id')::uuid; exception when invalid_text_representation then raise exception 'COHORT_VISIBILITY_INVALID'; end;
    expected:=(item->>'expected')::boolean; next_value:=(item->>'published')::boolean;
    if kind='week' then
      if not exists(select 1 from public.curriculum_weeks w where w.id=target and w.course_id=course
        and w.archived_at is null and (not next_value or w.is_published)) then raise exception 'COHORT_VISIBILITY_INVALID'; end if;
      if next_value and exists(select 1 from public.curriculum_lessons l
        join public.edu_cohort_lesson_visibility lv on lv.lesson_id=l.id and lv.cohort_id=p_cohort and lv.is_published
        where l.week_id=target and l.is_published and l.archived_at is null
          and not exists(select 1 from public.edu_lesson_block_heads h where h.lesson_id=l.id)
          and not exists(select 1 from public.lesson_contents body where body.lesson_id=l.id
            and (nullif(btrim(body.body_text),'') is not null or body.vod_url is not null
              or body.external_url is not null or body.resource_storage_path is not null)))
        then raise exception 'COHORT_VISIBILITY_EMPTY_LESSON'; end if;
      select v.is_published into old_value from public.edu_cohort_week_visibility v
        where v.cohort_id=p_cohort and v.week_id=target;
      if coalesce(old_value,false) is distinct from expected then raise exception 'COHORT_VISIBILITY_STALE'; end if;
      insert into public.edu_cohort_week_visibility(cohort_id,week_id,is_published)
        values(p_cohort,target,next_value)
        on conflict(cohort_id,week_id) do update set is_published=excluded.is_published,updated_at=now();
    else
      if not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
        where l.id=target and w.course_id=course and l.archived_at is null and w.archived_at is null
          and (not next_value or (l.is_published and w.is_published))) then raise exception 'COHORT_VISIBILITY_INVALID'; end if;
      if next_value and not exists(select 1 from public.edu_lesson_block_heads h where h.lesson_id=target)
        and not exists(select 1 from public.lesson_contents body where body.lesson_id=target
          and (nullif(btrim(body.body_text),'') is not null or body.vod_url is not null
            or body.external_url is not null or body.resource_storage_path is not null))
        then raise exception 'COHORT_VISIBILITY_EMPTY_LESSON'; end if;
      select v.is_published into old_value from public.edu_cohort_lesson_visibility v
        where v.cohort_id=p_cohort and v.lesson_id=target;
      if coalesce(old_value,false) is distinct from expected then raise exception 'COHORT_VISIBILITY_STALE'; end if;
      insert into public.edu_cohort_lesson_visibility(cohort_id,lesson_id,is_published)
        values(p_cohort,target,next_value)
        on conflict(cohort_id,lesson_id) do update set is_published=excluded.is_published,updated_at=now();
    end if;
    old_value:=null;
  end loop;
end;
$$;
revoke all on function public.edu_save_cohort_curriculum_visibility(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_save_cohort_curriculum_visibility(uuid,uuid,jsonb) to service_role;

-- All block/answer/question RPCs reuse this assertion, so one cohort check
-- also protects direct lesson URLs and all learner writes.
create or replace function public.edu_assert_block_access(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_edit boolean default false)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare can_edit boolean;
begin
  if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'BLOCK_FORBIDDEN'; end if;
  select exists(select 1 from public.profiles p where p.id=p_actor and (p.role='admin' or
    (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and s.value->'products'='true'::jsonb)))) into can_edit;
  if not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    join public.courses c on c.id=w.course_id where l.id=p_lesson and l.archived_at is null and w.archived_at is null and c.archived_at is null)
    then raise exception 'BLOCK_NOT_FOUND'; end if;
  if p_edit then
    if not can_edit then raise exception 'BLOCK_FORBIDDEN'; end if;
    return true;
  end if;
  if can_edit and p_enrollment is null then return true; end if;
  if not exists(select 1 from public.enrollments e
    join public.curriculum_weeks w on w.course_id=e.course_id join public.curriculum_lessons l on l.week_id=w.id
    where e.id=p_enrollment and e.user_id=p_actor and l.id=p_lesson
    and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())
    and edu_private.edu_cohort_lesson_visible(e.cohort_id,p_lesson))
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  if not (public.edu_lesson_progression_gate(p_enrollment,p_lesson)->>'isUnlocked')::boolean then raise exception 'BLOCK_LESSON_LOCKED'; end if;
  return false;
end;
$$;

create or replace function public.edu_read_lesson_progression(p_actor uuid,p_enrollment uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare course uuid; cohort uuid; graduate boolean;
begin
  select e.course_id,e.cohort_id into course,cohort from public.enrollments e
    join public.profiles p on p.id=e.user_id where e.id=p_enrollment and e.user_id=p_actor
    and p.status='active' and e.status='active' and e.revoked_at is null
    and (e.access_starts_at is null or e.access_starts_at<=now())
    and (e.access_ends_at is null or e.access_ends_at>now());
  if course is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  graduate:=public.edu_is_graduate_enrollment(p_enrollment);
  return coalesce((select jsonb_agg(
    case when graduate then jsonb_set(jsonb_set(public.edu_lesson_progression_gate(p_enrollment,l.id),'{isUnlocked}','true'::jsonb),'{reason}','""'::jsonb)
      else public.edu_lesson_progression_gate(p_enrollment,l.id) end
    || jsonb_build_object('tagLabel',coalesce(v.document->'presentation'->>'tagLabel','')) order by l.id)
    from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    left join public.edu_lesson_block_heads h on h.lesson_id=l.id
    left join public.edu_lesson_block_versions v on v.id=h.revision
    where w.course_id=course and edu_private.edu_cohort_lesson_visible(cohort,l.id)),'[]'::jsonb);
end;
$$;

create or replace function public.edu_question_contexts(p_actor uuid)
returns table(enrollment_id uuid,lesson_id uuid,label text,recent boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.edu_assert_message_actor(p_actor);
 return query select e.id,l.id,c.title||' · '||co.name||' · '||w.week_number||'주차 · '||l.title,p.updated_at is not null
 from public.enrollments e join public.courses c on c.id=e.course_id and c.archived_at is null
 join public.cohorts co on co.id=e.cohort_id
 join public.curriculum_weeks w on w.course_id=c.id and w.is_published and w.archived_at is null
 join public.curriculum_lessons l on l.week_id=w.id and l.is_published and l.archived_at is null
 left join public.lesson_progress p on p.enrollment_id=e.id and p.lesson_id=l.id
 where e.user_id=p_actor and e.status='active' and e.revoked_at is null and e.access_starts_at<=now()
 and (e.access_ends_at is null or e.access_ends_at>now())
 and edu_private.edu_cohort_lesson_visible(e.cohort_id,l.id)
 and (public.edu_is_graduate_enrollment(e.id) or (public.edu_lesson_progression_gate(e.id,l.id)->>'isUnlocked')::boolean)
 order by p.updated_at desc nulls last,c.title,co.name,w.week_number,l.day_number,l.id;
end; $$;

commit;
