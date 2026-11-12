begin;
set local lock_timeout='3s';

-- A durable, enrollment-specific exception to the ordering rule. Publication,
-- enrollment validity and any explicit track or mentor requirements still apply.
create table public.edu_preserved_lesson_access (
  enrollment_id uuid not null references public.enrollments on delete cascade,
  cohort_id uuid not null references public.cohorts on delete cascade,
  lesson_id uuid not null references public.curriculum_lessons on delete cascade,
  legacy boolean not null,
  primary key (enrollment_id,cohort_id,lesson_id,legacy)
);
create index edu_preserved_lesson_idx on public.edu_preserved_lesson_access(lesson_id);
create index edu_preserved_cohort_idx on public.edu_preserved_lesson_access(cohort_id);
alter table public.edu_preserved_lesson_access enable row level security;
revoke all on public.edu_preserved_lesson_access from public, anon, authenticated, service_role;
grant select on public.edu_preserved_lesson_access to service_role;

create function edu_private.store_lesson_access(p_rows public.edu_preserved_lesson_access[])
returns void language sql volatile set search_path='' as $$
  insert into public.edu_preserved_lesson_access select * from unnest(p_rows)
  on conflict do nothing;
$$;
revoke all on function edu_private.store_lesson_access(public.edu_preserved_lesson_access[]) from public,anon,authenticated,service_role;

create function edu_private.open_lesson_access(p_course uuid,p_cohort uuid,p_enrollment uuid)
returns setof public.edu_preserved_lesson_access language sql stable set search_path='' as $$
    with outline as materialized (
      select l.id, w.id as week_id, w.week_number,l.day_number,l.is_published and w.is_published as published,
        v.document->'progression' is null and not exists
          (select 1 from public.edu_ongoing_rules o where o.lesson_id=l.id) as untracked
      from public.curriculum_weeks w join public.curriculum_lessons l on l.week_id=w.id
      left join public.edu_lesson_block_heads h on h.lesson_id=l.id
      left join public.edu_lesson_block_versions v on v.id=h.revision
      where w.course_id=p_course and w.archived_at is null and l.archived_at is null
    ), positions as (
      select e.id as enrollment_id,e.cohort_id,o.id as lesson_id,mode.legacy,
        p.completed_at, o.published and coalesce(wv.is_published and lv.is_published,false) as visible,
        row_number() over (partition by e.id,mode.legacy order by o.week_number,o.day_number,o.id) as pos
      from public.enrollments e cross join outline o cross join (values (true),(false)) mode(legacy)
      left join public.edu_cohort_week_visibility wv on wv.cohort_id=e.cohort_id and wv.week_id=o.week_id
      left join public.edu_cohort_lesson_visibility lv on lv.cohort_id=e.cohort_id and lv.lesson_id=o.id
      left join public.lesson_progress p on p.enrollment_id=e.id and p.lesson_id=o.id
      where e.course_id=p_course and (p_cohort is null or e.cohort_id=p_cohort)
        and (p_enrollment is null or e.id=p_enrollment)
        and e.status='active' and e.revoked_at is null
        and (e.access_starts_at is null or e.access_starts_at<=now())
        and (e.access_ends_at is null or e.access_ends_at>now())
        and (mode.legacy or o.untracked)
    ), frontier as (
      select *,max(pos) filter(where completed_at is not null and (visible or not legacy))
        over(partition by enrollment_id,legacy) as last_done from positions
    ), open_through as (
      select *,min(pos) filter(where visible and pos>coalesce(last_done,0))
        over(partition by enrollment_id,legacy) as next_pos from frontier
    )
    select enrollment_id,cohort_id,lesson_id,legacy
    from open_through a where visible and completed_at is null and pos<=coalesce(next_pos,last_done)
      and not exists(select 1 from public.edu_preserved_lesson_access saved
        where (saved.enrollment_id,saved.cohort_id,saved.lesson_id,saved.legacy)=
          (a.enrollment_id,a.cohort_id,a.lesson_id,a.legacy))
$$;
revoke all on function edu_private.open_lesson_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- STABLE sees the outline at statement start, including for a multi-row
-- reorder. Reading intermediate row positions would grant unrelated lessons.
create function edu_private.preserve_open_lessons() returns trigger
language plpgsql stable security definer set search_path='' as $$
declare course uuid; cohort uuid;
begin
  if tg_table_name in ('edu_cohort_week_visibility','edu_cohort_lesson_visibility') then
    cohort := new.cohort_id;
    select c.course_id into course from public.cohorts c where c.id=cohort;
  elsif tg_table_name='curriculum_weeks' then
    course := new.course_id;
  else
    select w.course_id into course from public.curriculum_weeks w where w.id=new.week_id;
  end if;

  perform edu_private.store_lesson_access(array(
    select g from edu_private.open_lesson_access(course,cohort,null) g
  ));
  return new;
end;
$$;
revoke all on function edu_private.preserve_open_lessons() from public,anon,authenticated,service_role;

-- Also capture the learner's own committed step. An editor and a learner may
-- be publishing and completing concurrently, each seeing the earlier outline.
create function edu_private.preserve_enrollment_step() returns trigger
language plpgsql security definer set search_path='' as $$
declare learner uuid; course uuid; cohort uuid;
begin
  if tg_table_name='enrollments' then
    learner:=new.id; course:=new.course_id; cohort:=new.cohort_id;
  else
    learner:=new.enrollment_id;
    select e.course_id,e.cohort_id into course,cohort from public.enrollments e where e.id=learner;
  end if;
  perform edu_private.store_lesson_access(array(
    select g from edu_private.open_lesson_access(course,cohort,learner) g
  ));
  return new;
end;
$$;
revoke all on function edu_private.preserve_enrollment_step() from public,anon,authenticated,service_role;
create trigger preserve_access_on_enrollment after insert on public.enrollments
for each row when (new.status='active') execute function edu_private.preserve_enrollment_step();
create trigger preserve_access_on_completion after insert on public.lesson_progress
for each row when (new.completed_at is not null) execute function edu_private.preserve_enrollment_step();
create trigger preserve_access_on_first_completion after update of completed_at on public.lesson_progress
for each row when (old.completed_at is null and new.completed_at is not null) execute function edu_private.preserve_enrollment_step();

create trigger preserve_access_before_lesson_order before update of week_id,day_number,is_published,archived_at
on public.curriculum_lessons for each row when
  ((old.week_id,old.day_number,old.is_published,old.archived_at)
   is distinct from (new.week_id,new.day_number,new.is_published,new.archived_at))
execute function edu_private.preserve_open_lessons();
create trigger preserve_access_before_week_order before update of week_number,is_published,archived_at
on public.curriculum_weeks for each row when
  ((old.week_number,old.is_published,old.archived_at)
   is distinct from (new.week_number,new.is_published,new.archived_at))
execute function edu_private.preserve_open_lessons();
create trigger preserve_access_before_week_insert before insert
on public.edu_cohort_week_visibility for each row when (new.is_published)
execute function edu_private.preserve_open_lessons();
create trigger preserve_access_before_week_update before update of is_published
on public.edu_cohort_week_visibility for each row when (new.is_published is distinct from old.is_published)
execute function edu_private.preserve_open_lessons();
create trigger preserve_access_before_lesson_insert before insert
on public.edu_cohort_lesson_visibility for each row when (new.is_published)
execute function edu_private.preserve_open_lessons();
create trigger preserve_access_before_lesson_update before update of is_published
on public.edu_cohort_lesson_visibility for each row when (new.is_published is distinct from old.is_published)
execute function edu_private.preserve_open_lessons();

create or replace function public.edu_lesson_progression_gate(p_enrollment uuid,p_lesson uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare progression jsonb; course uuid; ordinal integer; track text; cap integer; reached integer; unlocked boolean; automatic boolean:=false; reason text:=''; frontier_week integer; frontier_day integer; frontier_id uuid;
begin
  select v.document->'progression',w.course_id into progression,course from public.edu_lesson_block_heads h
    join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons l on l.id=h.lesson_id
    join public.curriculum_weeks w on w.id=l.week_id where h.lesson_id=p_lesson;
  if exists(select 1 from public.edu_ongoing_rules where lesson_id=p_lesson) then
    if not exists(select 1 from public.enrollments where id=p_enrollment and course_id=course) then raise exception 'BLOCK_FORBIDDEN';end if;
    unlocked:=exists(select 1 from public.edu_enrollment_progression_grants where enrollment_id=p_enrollment and daily_open_through>28)
      or exists(select 1 from public.lesson_progress p join public.edu_lesson_block_heads h on h.lesson_id=p.lesson_id
        join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons done_l on done_l.id=p.lesson_id
        join public.curriculum_weeks done_w on done_w.id=done_l.week_id
        where p.enrollment_id=p_enrollment and p.completed_at is not null and done_w.course_id=course
          and v.document->'progression'->>'track'='daily' and (v.document->'progression'->>'dayNumber')::integer>=28);
    return jsonb_build_object('lessonId',p_lesson,'isUnlocked',unlocked,'automaticApproval',false,'track',null,'dayNumber',null,
      'ongoing',true,'reason',case when unlocked then '' else '28일차 데일리 미션을 승인받은 뒤 이용할 수 있습니다.' end);
  end if;
  if progression is null then
    -- Untracked lessons (including onboarding) also require explicit completion.
    -- Completed lessons remain revisitable when an earlier lesson is added later.
    select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=p_lesson;
    if not exists(select 1 from public.enrollments where id=p_enrollment and course_id=course) then raise exception 'BLOCK_FORBIDDEN'; end if;
    -- The highest earned active lesson anchors the learner's existing frontier.
    -- Evaluate it once, independently of the number of inserted prerequisites.
    select done_w.week_number,done_l.day_number,done_l.id into frontier_week,frontier_day,frontier_id
      from public.lesson_progress earned
      join public.curriculum_lessons done_l on done_l.id=earned.lesson_id
      join public.curriculum_weeks done_w on done_w.id=done_l.week_id
      left join public.edu_lesson_block_heads dh on dh.lesson_id=done_l.id
      left join public.edu_lesson_block_versions dv on dv.id=dh.revision
      where earned.enrollment_id=p_enrollment and earned.completed_at is not null
        and done_w.course_id=course and done_l.archived_at is null and done_w.archived_at is null
        and dv.document->'progression' is null
        and not exists(select 1 from public.edu_ongoing_rules where lesson_id=done_l.id)
      order by done_w.week_number desc,done_l.day_number desc,done_l.id desc limit 1;
    unlocked:=exists(select 1 from public.edu_preserved_lesson_access a
        join public.enrollments e on e.id=a.enrollment_id and e.cohort_id=a.cohort_id
        where a.enrollment_id=p_enrollment and a.lesson_id=p_lesson and not a.legacy
          and edu_private.edu_cohort_lesson_visible(a.cohort_id,p_lesson))
      or exists(select 1 from public.lesson_progress where enrollment_id=p_enrollment and lesson_id=p_lesson and completed_at is not null)
      or not exists(
        select 1 from public.curriculum_lessons prev
        join public.curriculum_weeks pw on pw.id=prev.week_id
        join public.curriculum_lessons current on current.id=p_lesson
        join public.curriculum_weeks cw on cw.id=current.week_id
        join public.enrollments e on e.id=p_enrollment
        left join public.edu_lesson_block_heads ph on ph.lesson_id=prev.id
        left join public.edu_lesson_block_versions pv on pv.id=ph.revision
        where pw.course_id=course and (pw.week_number,prev.day_number,prev.id)<(cw.week_number,current.day_number,current.id)
          and edu_private.edu_cohort_lesson_visible(e.cohort_id,prev.id)
          and pv.document->'progression' is null
          and not exists(select 1 from public.edu_ongoing_rules where lesson_id=prev.id)
          and not exists(select 1 from public.lesson_progress p where p.enrollment_id=p_enrollment and p.lesson_id=prev.id and p.completed_at is not null)
          and prev.archived_at is null and pw.archived_at is null
          and (frontier_id is null or (pw.week_number,prev.day_number,prev.id)>(frontier_week,frontier_day,frontier_id))
      );
    return jsonb_build_object('lessonId',p_lesson,'isUnlocked',unlocked,'automaticApproval',false,'track',null,'dayNumber',null,'reason',case when unlocked then '' else '앞 학습에서 학습 완료하기를 눌러 주세요.' end);
  end if;
  track:=progression->>'track'; ordinal:=(progression->>'dayNumber')::integer;
  if coalesce(track,'') not in ('daily','learning') or ordinal not between 1 and 30 then raise exception 'BLOCK_INVALID'; end if;
  if not exists(select 1 from public.enrollments where id=p_enrollment and course_id=course) then raise exception 'BLOCK_FORBIDDEN'; end if;
  -- Ambiguous mappings (including an operator restoring an archived duplicate)
  -- must not accidentally unlock the wrong lesson.
  if (select count(*) from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision
      join public.curriculum_lessons l on l.id=h.lesson_id join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=course and l.archived_at is null and w.archived_at is null
        and v.document->'progression'=progression)>1 then raise exception 'BLOCK_PROGRESSION_DUPLICATE'; end if;
  if track='daily' then
    select s.auto_approve_through_week*5 into cap from public.edu_cohort_progression_settings s join public.enrollments e on e.cohort_id=s.cohort_id where e.id=p_enrollment;
    select greatest(1,coalesce(max((v.document->'progression'->>'dayNumber')::integer)+1,1),
      coalesce((select daily_open_through from public.edu_enrollment_progression_grants where enrollment_id=p_enrollment),1)) into reached
      from public.lesson_progress p join public.edu_lesson_block_heads h on h.lesson_id=p.lesson_id join public.edu_lesson_block_versions v on v.id=h.revision
      join public.curriculum_lessons done_l on done_l.id=p.lesson_id join public.curriculum_weeks done_w on done_w.id=done_l.week_id
      where done_w.course_id=course and p.enrollment_id=p_enrollment and p.completed_at is not null and v.document->'progression'->>'track'='daily';
    unlocked:=ordinal<=least(reached,coalesce(cap,31)); automatic:=cap is not null and ordinal<=cap;
    if not unlocked then reason:=case when cap is not null and ordinal>cap then '아직 공개하지 않은 주차입니다. 운영자의 안내를 기다려 주세요.' else '이전 데일리 미션의 승인이 끝나면 열립니다.' end; end if;
  else
    unlocked:=ordinal=1 or exists(select 1 from public.lesson_progress p join public.edu_lesson_block_heads h on h.lesson_id=p.lesson_id
      join public.edu_lesson_block_versions v on v.id=h.revision join public.curriculum_lessons done_l on done_l.id=p.lesson_id join public.curriculum_weeks done_w on done_w.id=done_l.week_id
      where done_w.course_id=course and p.enrollment_id=p_enrollment and p.completed_at is not null and
        v.document->'progression'->>'track'='learning' and (v.document->'progression'->>'dayNumber')::integer in (ordinal-1,ordinal));
    if not unlocked then reason:='바로 앞 학습의 시험을 통과하면 열립니다.'; end if;
  end if;
  return jsonb_build_object('lessonId',p_lesson,'track',track,'dayNumber',ordinal,'isUnlocked',unlocked,'automaticApproval',automatic,'reason',reason);
end;
$$;

create or replace function edu_private.edu_learning_care_cells(p_enrollment uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.enrollments%rowtype; graduate boolean; cap integer; cells jsonb;
begin
 select * into e from public.enrollments where id=p_enrollment;
 if not found then raise exception 'CARE_NOT_FOUND'; end if;
 graduate:=public.edu_is_graduate_enrollment(e.id);
 select auto_approve_through_week*5 into cap from public.edu_cohort_progression_settings where cohort_id=e.cohort_id;
 with all_items as materialized (
  select l.id,l.title,w.week_number,l.day_number,l.archived_at as lesson_archived,w.archived_at as week_archived,
   v.document->'progression' as progression,p.completed_at,
   exists(select 1 from public.edu_ongoing_rules r where r.lesson_id=l.id) as ongoing,
   coalesce(l.is_published and w.is_published and wv.is_published and lv.is_published and c.id is not null,false) as visible
  from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
  left join public.edu_lesson_block_heads h on h.lesson_id=l.id
  left join public.edu_lesson_block_versions v on v.id=h.revision
  left join public.lesson_progress p on p.lesson_id=l.id and p.enrollment_id=e.id
  left join public.cohorts c on c.id=e.cohort_id and c.course_id=w.course_id
  left join public.edu_cohort_week_visibility wv on wv.cohort_id=c.id and wv.week_id=w.id
  left join public.edu_cohort_lesson_visibility lv on lv.cohort_id=c.id and lv.lesson_id=l.id
  where w.course_id=e.course_id
 ), completion as (
  select greatest(1,coalesce(max((progression->>'dayNumber')::integer) filter(where progression->>'track'='daily')+1,1),
    coalesce((select daily_open_through from public.edu_enrollment_progression_grants where enrollment_id=e.id),1)) as reached,
   coalesce(array_agg((progression->>'dayNumber')::integer) filter(where progression->>'track'='learning'),'{}'::integer[]) as learned
  from all_items where completed_at is not null
 ), active_items as (
  select *,count(*) over(partition by progression) as mapping_count
  from all_items where lesson_archived is null and week_archived is null
 ), untracked_frontier as (
  select week_number,day_number,id from active_items
  where progression is null and not ongoing and completed_at is not null
  order by week_number desc,day_number desc,id desc limit 1
 ), ordered_items as (
  -- Ongoing items participate in duplicate detection but never in care cells
  -- or the untracked prerequisite sequence.
  select i.*,count(*) filter(where progression is null and visible and completed_at is null
    and (f.id is null or (i.week_number,i.day_number,i.id)>(f.week_number,f.day_number,f.id)))
    over(order by i.week_number,i.day_number,i.id rows between unbounded preceding and 1 preceding) as prior_incomplete,
   progression->>'track' as configured_track,(progression->>'dayNumber')::integer as ordinal,
   coalesce((progression->>'dayNumber')::integer,i.day_number) as day
  from active_items i left join untracked_frontier f on true where not ongoing
 ), tracked_predecessors as (
  -- The gate recognizes archived/hidden completed mappings too. A duplicate
  -- predecessor is ambiguous: keep the existing gate, but never guess a clock.
  select (progression->>'dayNumber')::integer as ordinal,count(*) as mappings,
   (array_agg(id order by id))[1] as previous_id,min(completed_at) as previous_completed
  from all_items where progression->>'track'='learning' and not ongoing
  group by (progression->>'dayNumber')::integer
 ), untracked_sequence as (
  -- This is the same visible, untracked required sequence used by the gate.
  select id,lag(id) over seq as previous_id,lag(completed_at) over seq as previous_completed
  from ordered_items where progression is null and visible
  window seq as (order by week_number,day_number,id)
 ), gates as (
  select i.*,visible and (graduate or configured_track is distinct from 'daily' or cap is null or day<=cap) as published,
   progression is not null and (coalesce(configured_track,'') not in ('daily','learning') or ordinal not between 1 and 30 or mapping_count>1) as gate_error,
   case when progression is null then completed_at is not null or prior_incomplete=0
     or exists(select 1 from public.edu_preserved_lesson_access a where a.enrollment_id=e.id
       and a.cohort_id=e.cohort_id and a.lesson_id=i.id and not a.legacy and i.visible)
    when configured_track='daily' then ordinal<=least(reached,coalesce(cap,31))
    else ordinal=1 or exists(select 1 from unnest(learned) done where done in (ordinal-1,ordinal)) end as unlocked
  from ordered_items i cross join completion
 ), with_timing as (
  select g.*,jsonb_build_object(
   'state',case
    when gate_error or not published or configured_track='daily' then 'unavailable'
    when g.configured_track='learning' and g.ordinal=1 then 'first'
    when configured_track='learning' and t.mappings=1 then 'known'
    when progression is null and u.id is not null and prior_incomplete=0 then
     case when u.previous_id is null then 'first' when u.previous_completed is not null then 'known' else 'unavailable' end
    else 'unavailable' end,
   'previousLessonId',case when g.progression is null and g.prior_incomplete=0 then u.previous_id when g.configured_track='learning' and g.ordinal>1 and t.mappings=1 then t.previous_id end,
   'previousCompletedAt',case when g.progression is null and g.prior_incomplete=0 then u.previous_completed when g.configured_track='learning' and g.ordinal>1 and t.mappings=1 then t.previous_completed end
  ) as timing
  from gates g left join tracked_predecessors t on t.ordinal=g.ordinal-1
  left join untracked_sequence u on u.id=g.id
 ), with_receipts as (
  -- Preserve the live batch projection: do not fetch complete submission receipts
  -- (answers and block documents) for every learner/lesson cell.
  select g.*,s.id as submission_id,case when s.id is not null then jsonb_build_object(
   'state',case when r.decision='auto_approved' then 'approved' else coalesce(r.decision,s.outcome) end,
   'createdAt',s.created_at,'reviewedAt',r.created_at) end as receipt
  from with_timing g left join lateral (select * from public.edu_lesson_block_submissions s
   where s.enrollment_id=e.id and s.lesson_id=g.id order by s.sequence desc limit 1) s on true
  left join lateral (select decision,created_at from public.edu_lesson_block_reviews r
   where r.submission_id=s.id order by sequence desc limit 1) r on true
 ), states as (
  select *,case
   when not published then 'scheduled'
   when gate_error then 'error'
   when receipt->>'state' in ('changes_requested','reopened') then 'changes_requested'
   when receipt->>'state'='submitted' then 'submitted'
   when completed_at is not null then 'completed'
   when not graduate and not coalesce(unlocked,false) then 'locked'
   else 'not_submitted' end as state,
   case when published and not coalesce(gate_error,false) and not unlocked then
    case when progression is null then '앞 학습에서 학습 완료하기를 눌러 주세요.'
     when configured_track='daily' then case when cap is not null and ordinal>cap
      then '아직 공개하지 않은 주차입니다. 운영자의 안내를 기다려 주세요.' else '이전 데일리 미션의 승인이 끝나면 열립니다.' end
     else '바로 앞 학습의 시험을 통과하면 열립니다.' end
    else '' end as reason
  from with_receipts
 )
 select coalesce(jsonb_agg(jsonb_build_object('lessonId',id,'title',title,'week',week_number,
  'day',day,'track',coalesce(configured_track,'learning'),'state',state,'published',published,
  'completedAt',case when state='completed' then completed_at end,
  'timing',timing,'submittedAt',receipt->>'createdAt','reviewedAt',receipt->>'reviewedAt','submissionId',submission_id,'reason',reason)
  order by week_number,day_number,id),'[]') into cells from states;
 return cells;
end; $$;
revoke all on function edu_private.edu_learning_care_cells(uuid) from public,anon,authenticated;
grant execute on function edu_private.edu_learning_care_cells(uuid) to service_role;

commit;
