begin;

-- A projection only: no completion, release or enrollment decisions are changed.
create function edu_private.edu_learning_care_cells(p_enrollment uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.enrollments%rowtype; item record; gate jsonb; receipt jsonb; cells jsonb:='[]';
  visible boolean; published boolean; state text; cap integer; graduate boolean;
begin
 select * into e from public.enrollments where id=p_enrollment;
 if not found then raise exception 'CARE_NOT_FOUND'; end if;
 graduate:=public.edu_is_graduate_enrollment(e.id);
 select auto_approve_through_week*5 into cap from public.edu_cohort_progression_settings where cohort_id=e.cohort_id;
 for item in
  select l.id,l.title,w.week_number,l.day_number,
    coalesce(v.document->'progression'->>'track','learning') as track,
    coalesce((v.document->'progression'->>'dayNumber')::integer,l.day_number) as day,
    v.document->'progression'->>'track' as configured_track,
    p.completed_at,
    s.id as submission_id, case when s.id is not null then public.edu_block_submission_receipt(s) end as receipt
  from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
  left join public.edu_lesson_block_heads h on h.lesson_id=l.id
  left join public.edu_lesson_block_versions v on v.id=h.revision
  left join public.lesson_progress p on p.lesson_id=l.id and p.enrollment_id=e.id
  left join lateral (select * from public.edu_lesson_block_submissions s where s.enrollment_id=e.id and s.lesson_id=l.id order by s.sequence desc limit 1) s on true
  where w.course_id=e.course_id and l.archived_at is null and w.archived_at is null
    and not exists(select 1 from public.edu_ongoing_rules r where r.lesson_id=l.id)
  order by w.week_number,l.day_number,l.id
 loop
  visible:=edu_private.edu_cohort_lesson_visible(e.cohort_id,item.id);
  published:=visible and (graduate or item.configured_track is distinct from 'daily' or cap is null or item.day<=cap);
  gate:='{}'; receipt:=item.receipt;
  if published then
   begin gate:=public.edu_lesson_progression_gate(e.id,item.id);
   exception when raise_exception then
    if sqlerrm not in ('BLOCK_INVALID','BLOCK_PROGRESSION_DUPLICATE','BLOCK_FORBIDDEN') then raise; end if;
    gate:=jsonb_build_object('error',true);
   end;
  end if;
  state:=case
   when not published then 'scheduled'
   when gate->'error'='true'::jsonb then 'error'
   when receipt->>'state' in ('changes_requested','reopened') then 'changes_requested'
   when receipt->>'state'='submitted' then 'submitted'
   when item.completed_at is not null then 'completed'
   when not graduate and not coalesce((gate->>'isUnlocked')::boolean,false) then 'locked'
   else 'not_submitted' end;
  cells:=cells||jsonb_build_array(jsonb_build_object('lessonId',item.id,'title',item.title,'week',item.week_number,
   'day',item.day,'track',item.track,'state',state,'published',published,
   'completedAt',case when state='completed' then item.completed_at end,
   'submittedAt',receipt->>'createdAt','reviewedAt',receipt->>'reviewedAt',
   'submissionId',item.submission_id,'reason',coalesce(gate->>'reason','')));
 end loop;
 return cells;
end; $$;
revoke all on function edu_private.edu_learning_care_cells(uuid) from public,anon,authenticated;
grant execute on function edu_private.edu_learning_care_cells(uuid) to service_role;

create function public.edu_admin_learning_care(p_actor uuid,p_cohort uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare options jsonb; result jsonb; selected uuid;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'courseTitle',title) order by name,id),'[]') into options from (
  select distinct co.id,co.name,c.title from public.cohorts co join public.courses c on c.id=co.course_id
  join public.enrollments e on e.cohort_id=co.id join public.profiles p on p.id=e.user_id
  where c.archived_at is null and p.status='active' and p.role not in ('admin','staff')
    and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now())
    and (e.access_ends_at is null or e.access_ends_at>now())
 ) cohorts;
 selected:=coalesce(p_cohort,(options->0->>'id')::uuid);
 select coalesce(jsonb_agg(jsonb_build_object('enrollmentId',e.id,'memberId',p.id,'name',p.full_name,'email',p.email,
  'cells',edu_private.edu_learning_care_cells(e.id),
  'lastVisitAt',(select max(last_seen_at) from public.edu_member_visits where user_id=p.id),
  'lastContactAt',(select max(m.created_at) from public.edu_member_messages m join public.profiles sender on sender.id=m.sender_id
    where m.recipient_id=p.id and sender.role in ('admin','staff') and not m.is_notice),
  'openQuestions',(select count(*) from public.edu_questions q where q.user_id=p.id and q.course_id=e.course_id and q.status='open' and not q.is_archived)
 ) order by p.full_name nulls last,p.id,e.id),'[]') into result
 from public.enrollments e join public.profiles p on p.id=e.user_id join public.courses c on c.id=e.course_id
 where e.cohort_id=selected and c.archived_at is null and p.status='active' and p.role not in ('admin','staff')
  and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now())
  and (e.access_ends_at is null or e.access_ends_at>now());
 return jsonb_build_object('cohorts',options,'cohortId',selected,'rows',result,'asOf',now());
end; $$;
revoke all on function public.edu_admin_learning_care(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_admin_learning_care(uuid,uuid) to service_role;

create function public.edu_member_learning_care(p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'CARE_FORBIDDEN'; end if;
 return jsonb_build_object('asOf',now(),'rows',coalesce((select jsonb_agg(jsonb_build_object('enrollmentId',e.id,
  'courseTitle',c.title,'cohortName',co.name,'cells',
  (select coalesce(jsonb_agg(cell),'[]') from jsonb_array_elements(edu_private.edu_learning_care_cells(e.id)) cell where cell->'published'='true'::jsonb)) order by e.id)
 from public.enrollments e join public.courses c on c.id=e.course_id left join public.cohorts co on co.id=e.cohort_id
 where e.user_id=p_actor and c.archived_at is null and e.status='active' and e.revoked_at is null
  and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())),'[]'));
end; $$;
revoke all on function public.edu_member_learning_care(uuid) from public,anon,authenticated;
grant execute on function public.edu_member_learning_care(uuid) to service_role;

-- A care receipt records purpose and retry identity; message content stays in the
-- existing message system. RLS and service-only RPCs keep this admin-only.
create table public.edu_learning_care_sends (
 actor_id uuid not null references public.profiles(id),request_id uuid not null,
 cohort_id uuid not null references public.cohorts(id),lesson_id uuid not null references public.curriculum_lessons(id),
 recipients uuid[] not null,receipt jsonb not null,created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
alter table public.edu_learning_care_sends enable row level security;
revoke all on public.edu_learning_care_sends from public,anon,authenticated;
grant select,insert on public.edu_learning_care_sends to service_role;
create function public.edu_send_learning_care(p_actor uuid,p_request uuid,p_cohort uuid,p_lesson uuid,p_recipients uuid[],p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare targets uuid[]; previous public.edu_learning_care_sends%rowtype; target uuid; receipt jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_request is null or p_cohort is null or p_lesson is null or p_recipients is null or cardinality(p_recipients) not between 1 and 100
  or array_position(p_recipients,null) is not null then raise exception 'CARE_INVALID'; end if;
 select array_agg(distinct x order by x) into targets from unnest(p_recipients) x;
 perform pg_advisory_xact_lock(hashtextextended('edu-message:'||p_actor::text,0));
 select * into previous from public.edu_learning_care_sends where actor_id=p_actor and request_id=p_request;
 if found then
  if previous.cohort_id<>p_cohort or previous.lesson_id<>p_lesson or previous.recipients<>targets then raise exception 'MESSAGE_REQUEST_REUSED'; end if;
  return public.edu_send_member_message(p_actor,p_request,p_content,targets,null,null);
 end if;
 if exists(select 1 from public.edu_message_batches where actor_id=p_actor and request_id=p_request) then raise exception 'MESSAGE_REQUEST_REUSED'; end if;
 -- Deterministic recipient locks prevent simultaneous care sends by two staff.
 foreach target in array targets loop
  perform pg_advisory_xact_lock(hashtextextended('edu-care-recipient:'||target::text,0));
  if exists(select 1 from public.edu_member_messages m join public.profiles p on p.id=m.sender_id
   where m.recipient_id=target and p.role in ('admin','staff') and not m.is_notice and m.created_at>now()-interval '24 hours')
   or not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
     join public.courses c on c.id=e.course_id
     cross join lateral jsonb_array_elements(edu_private.edu_learning_care_cells(e.id)) cell
     where e.user_id=target and e.cohort_id=p_cohort and p.status='active' and p.role not in ('admin','staff')
       and c.archived_at is null and e.status='active' and e.revoked_at is null
       and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
       and cell->>'lessonId'=p_lesson::text and cell->>'state' in ('not_submitted','changes_requested'))
   then raise exception 'CARE_RECIPIENT_CHANGED'; end if;
 end loop;
 receipt:=public.edu_send_member_message(p_actor,p_request,p_content,targets,null,null);
 insert into public.edu_learning_care_sends(actor_id,request_id,cohort_id,lesson_id,recipients,receipt)
 values(p_actor,p_request,p_cohort,p_lesson,targets,receipt);
 return receipt;
end; $$;
revoke all on function public.edu_send_learning_care(uuid,uuid,uuid,uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.edu_send_learning_care(uuid,uuid,uuid,uuid,uuid[],text) to service_role;
commit;
