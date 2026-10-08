begin;

-- Read-only projection of edu_lesson_progression_gate (20261002102250).
-- Resolve curriculum, visibility, completion and duplicate mappings once per
-- enrollment instead of invoking the gate once for every cell (117 x 60 calls).
-- Keep completion/release writes and the authoritative gate unchanged. Parity
-- tests compare this projection with the original gate-based implementation.
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
  -- The gate deliberately counts completed archived/hidden items too.
  select greatest(1,coalesce(max((progression->>'dayNumber')::integer) filter(where progression->>'track'='daily')+1,1),
    coalesce((select daily_open_through from public.edu_enrollment_progression_grants where enrollment_id=e.id),1)) as reached,
   coalesce(array_agg((progression->>'dayNumber')::integer) filter(where progression->>'track'='learning'),'{}'::integer[]) as learned
  from all_items where completed_at is not null
 ), active_items as (
  select *,count(*) over(partition by progression) as mapping_count
  from all_items where lesson_archived is null and week_archived is null
 ), ordered_items as (
  -- Ongoing items participate in duplicate detection but never in care cells
  -- or the untracked prerequisite sequence.
  select *,count(*) filter(where progression is null and visible and completed_at is null)
    over(order by week_number,day_number,id rows between unbounded preceding and 1 preceding) as prior_incomplete,
   progression->>'track' as configured_track,(progression->>'dayNumber')::integer as ordinal,
   coalesce((progression->>'dayNumber')::integer,day_number) as day
  from active_items where not ongoing
 ), gates as (
  select i.*,visible and (graduate or configured_track is distinct from 'daily' or cap is null or day<=cap) as published,
   progression is not null and (coalesce(configured_track,'') not in ('daily','learning') or ordinal not between 1 and 30 or mapping_count>1) as gate_error,
   case when progression is null then completed_at is not null or prior_incomplete=0
    when configured_track='daily' then ordinal<=least(reached,coalesce(cap,31))
    else ordinal=1 or exists(select 1 from unnest(learned) done where done in (ordinal-1,ordinal)) end as unlocked
  from ordered_items i cross join completion
 ), with_receipts as (
  select g.*,s.id as submission_id,case when s.id is not null then public.edu_block_submission_receipt(s) end as receipt
  from gates g left join lateral (select * from public.edu_lesson_block_submissions s
   where s.enrollment_id=e.id and s.lesson_id=g.id order by s.sequence desc limit 1) s on true
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
  'submittedAt',receipt->>'createdAt','reviewedAt',receipt->>'reviewedAt','submissionId',submission_id,'reason',reason)
  order by week_number,day_number,id),'[]') into cells from states;
 return cells;
end; $$;
revoke all on function edu_private.edu_learning_care_cells(uuid) from public,anon,authenticated;
grant execute on function edu_private.edu_learning_care_cells(uuid) to service_role;
commit;
