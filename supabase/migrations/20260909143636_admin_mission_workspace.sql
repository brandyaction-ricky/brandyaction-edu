begin;

-- A canonical snapshot supplies both editor data and a revision from the same
-- statement. Answer keys remain behind server-only function grants.
create function public.admin_curriculum_snapshot(p_course_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with snapshot as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'label', w.week_number::text || '주차', 'title', w.title,
      'goal', coalesce(w.goal,''), 'isPublished', w.is_published,
      'lessons', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', l.id, 'day', l.day_number, 'title', l.title,
        'description', coalesce(l.description,''), 'duration', coalesce(l.duration_label,''),
        'kind', case l.content_type when 'material' then '자료' when 'text' then '텍스트' when 'link' then '링크' else 'VOD' end,
        'isPublished', l.is_published, 'accessMode', l.access_mode,
        'contentUrl', coalesce(c.vod_url,c.external_url), 'bodyText', c.body_text,
        'resourceName', c.resource_name, 'resourcePath', c.resource_storage_path,
        'mission', case when m.id is not null then jsonb_build_object(
          'id',m.id,'title',m.title,'instructions',coalesce(m.instructions,''),
          'required',m.is_required,'submissionType',m.submission_type,'isPublished',m.is_published,
          'quiz',case when q.mission_id is not null then jsonb_build_object('questions',q.questions,'passPercent',q.pass_percent) end
        ) end
      )) order by l.display_order,l.id)
      from public.curriculum_lessons l
      left join public.lesson_contents c on c.lesson_id=l.id
      left join public.curriculum_missions m on m.lesson_id=l.id
      left join public.mission_quizzes q on q.mission_id=m.id
      where l.week_id=w.id),'[]'::jsonb)
    ) order by w.display_order,w.id),'[]'::jsonb) as weeks
    from public.curriculum_weeks w where w.course_id=p_course_id
  ) select jsonb_build_object('weeks',weeks,'revision',md5(weeks::text)) from snapshot;
$$;

create function public.admin_mission_workspace(p_course_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with course_list as (
    select id,title,slug,status,display_order,created_at from public.courses
  ), selected as (
    select id from course_list
    where p_course_id is null or id=p_course_id
    order by display_order desc,created_at desc limit 1
  ), counts as (
    select m.lesson_id,
      count(distinct s.enrollment_id) filter(where s.status='approved') as approved,
      count(distinct s.enrollment_id) filter(where s.status='submitted') as pending
    from public.curriculum_missions m
    join public.curriculum_lessons l on l.id=m.lesson_id
    join public.curriculum_weeks w on w.id=l.week_id and w.course_id=(select id from selected)
    left join public.mission_submissions s on s.mission_id=m.id
    group by m.lesson_id
  ) select jsonb_build_object(
    'courses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'slug',slug,'status',status) order by display_order desc,created_at desc) from course_list),'[]'::jsonb),
    'courseId',(select id from selected),
    'counts',coalesce((select jsonb_object_agg(lesson_id,jsonb_build_object('approved',approved,'pending',pending)) from counts),'{}'::jsonb)
  ) || public.admin_curriculum_snapshot((select id from selected));
$$;

-- The existing curriculum writer also locks this course. A stale mission editor
-- cannot overwrite another operator's content, quiz or ordering changes.
create function public.save_admin_mission_workspace(p_course_id uuid,p_actor uuid,p_weeks jsonb,p_revision text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('admin','staff')) then
    raise exception '운영자 권한이 필요합니다.';
  end if;
  perform 1 from public.courses where id=p_course_id for update;
  if not found then raise exception '클래스를 찾을 수 없습니다.'; end if;
  if p_revision is distinct from (public.admin_curriculum_snapshot(p_course_id)->>'revision') then
    raise exception using errcode='40001',message='다른 운영자가 콘텐츠를 변경했습니다. 새로 불러온 뒤 변경사항을 다시 적용해 주세요.';
  end if;
  perform public.save_course_curriculum(p_course_id,p_actor,p_weeks);
  return public.admin_mission_workspace(p_course_id);
end;
$$;

revoke all on function public.admin_curriculum_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.admin_mission_workspace(uuid) from public,anon,authenticated;
revoke all on function public.save_admin_mission_workspace(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_curriculum_snapshot(uuid) to service_role;
grant execute on function public.admin_mission_workspace(uuid) to service_role;
grant execute on function public.save_admin_mission_workspace(uuid,uuid,jsonb,text) to service_role;

-- Operational groups are separate from behavioral marketing tags.
create table public.member_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 1 and 80),
  description text not null default '' check(length(description)<=1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.member_group_members (
  group_id uuid not null references public.member_groups(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(group_id,member_id)
);
create index member_group_members_member_idx on public.member_group_members(member_id);
alter table public.member_groups enable row level security;
alter table public.member_group_members enable row level security;
revoke all on public.member_groups,public.member_group_members from public,anon,authenticated;
grant select on public.member_groups,public.member_group_members to authenticated;
grant all on public.member_groups,public.member_group_members to service_role;
create policy operator_group_read on public.member_groups for select to authenticated using ((select public.has_operator_permission('members')));
create policy operator_group_member_read on public.member_group_members for select to authenticated using ((select public.has_operator_permission('members')));

create function public.admin_participant_report(p_cohort uuid default null,p_search text default '',p_level integer default null,p_attention boolean default null,p_page integer default 1)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with cohorts as (
    select ch.id,ch.name,ch.course_id,ch.capacity,ch.operation_start_at,c.title as course_title
    from public.cohorts ch join public.courses c on c.id=ch.course_id where ch.status<>'cancelled'
  ), selected as (
    select * from cohorts where p_cohort is null or id=p_cohort order by operation_start_at desc nulls last,id limit 1
  ), lessons as (
    select l.id,w.id as week_id from public.curriculum_lessons l
    join public.curriculum_weeks w on w.id=l.week_id
    where w.course_id=(select course_id from selected) and w.is_published and l.is_published
  ), missions as (
    select m.id,l.week_id from public.curriculum_missions m join lessons l on l.id=m.lesson_id where m.is_published and m.is_required
  ), enrolled as (
    select e.id,e.user_id,e.created_at,p.full_name,p.email from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.cohort_id=(select id from selected) and e.status='active' and p.status='active'
      and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())
  ), progress as (
    select lp.enrollment_id,sum(lp.progress_percent) as total,
      count(*) filter(where lp.progress_percent=100) as complete,max(lp.updated_at) as last_at
    from public.lesson_progress lp join enrolled e on e.id=lp.enrollment_id join lessons l on l.id=lp.lesson_id group by lp.enrollment_id
  ), latest as (
    select distinct on(s.enrollment_id,s.mission_id) s.enrollment_id,s.mission_id,s.status,s.submitted_at
    from public.mission_submissions s join enrolled e on e.id=s.enrollment_id join missions m on m.id=s.mission_id
    order by s.enrollment_id,s.mission_id,s.attempt_number desc
  ), submissions as (
    select enrollment_id,count(*) as submitted,count(*) filter(where status='approved') as approved,
      count(*) filter(where status='submitted') as pending,max(submitted_at) as last_at
    from latest group by enrollment_id
  ), usage as (
    select u.enrollment_id,max(u.last_used_at) as last_at from public.learning_usage_events u join enrolled e on e.id=u.enrollment_id group by u.enrollment_id
  ), totals as (
    select (select count(*) from lessons) as lessons,(select count(*) from missions) as missions
  ), calculated as (
    select e.*,t.lessons as lesson_total,t.missions as mission_total,
      case when t.lessons=0 then 0 when coalesce(pr.complete,0)=t.lessons then 100 else least(99,round(coalesce(pr.total,0)::numeric/t.lessons)::int) end as learning_percent,
      coalesce(s.submitted,0) as submitted,coalesce(s.approved,0) as approved,coalesce(s.pending,0) as pending,
      case when t.missions>0 then floor(coalesce(s.approved,0)::numeric*100/t.missions)::int end as achievement,
      greatest(pr.last_at,s.last_at,u.last_at) as last_activity
    from enrolled e cross join totals t left join progress pr on pr.enrollment_id=e.id left join submissions s on s.enrollment_id=e.id left join usage u on u.enrollment_id=e.id
  ), report as (
    select *,case when achievement is null then null when achievement=100 then 5 when achievement>=75 then 4 when achievement>=50 then 3 when achievement>=25 then 2 else 1 end as level,
      coalesce(last_activity,created_at)<now()-interval '3 days' as attention from calculated
  ), filtered as (
    select * from report where (p_search='' or position(lower(p_search) in lower(coalesce(full_name,'') || ' ' || email))>0)
      and (p_level is null or level=p_level) and (p_attention is null or attention=p_attention)
  ), page as (
    select * from filtered order by attention desc,full_name nulls last,id limit 50 offset (greatest(1,p_page)-1)*50
  ) select jsonb_build_object(
    'cohorts',coalesce((select jsonb_agg(to_jsonb(cohorts) order by operation_start_at desc nulls last,id) from cohorts),'[]'::jsonb),
    'cohortId',(select id from selected),'capacity',(select capacity from selected),
    'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
    'total',(select count(*) from filtered),'page',greatest(1,p_page),
    'stats',jsonb_build_object('participants',(select count(*) from report),'average', (select round(avg(achievement)) from report),
      'participation',coalesce((select round(100.0*count(*) filter(where submitted>0)/nullif(count(*),0)) from report),0),
      'attention',(select count(*) from report where attention)),
    'weeks',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'week',w.week_number,'participants',
      (select count(distinct s.enrollment_id) from latest s join missions m on m.id=s.mission_id where m.week_id=w.id)) order by w.display_order)
      from public.curriculum_weeks w where w.course_id=(select course_id from selected) and w.is_published),'[]'::jsonb)
  );
$$;
revoke all on function public.admin_participant_report(uuid,text,integer,boolean,integer) from public,anon,authenticated;
grant execute on function public.admin_participant_report(uuid,text,integer,boolean,integer) to service_role;

commit;
