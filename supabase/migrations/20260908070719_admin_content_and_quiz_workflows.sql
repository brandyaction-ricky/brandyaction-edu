begin;

alter table public.curriculum_lessons drop constraint curriculum_lessons_content_type_check;
alter table public.curriculum_lessons add constraint curriculum_lessons_content_type_check check (content_type in ('vod','material','text','link'));
alter table public.curriculum_lessons add column access_mode text not null default 'enrolled' check (access_mode in ('enrolled','member'));
alter table public.lesson_contents add column body_text text;
alter table public.lesson_contents add column external_url text;
alter table public.lesson_contents drop constraint lesson_contents_check;
alter table public.lesson_contents add constraint lesson_contents_check check (num_nonnulls(vod_url, resource_storage_path, body_text, external_url) = 1);
alter table public.curriculum_missions drop constraint curriculum_missions_submission_type_check;
alter table public.curriculum_missions add constraint curriculum_missions_submission_type_check check (submission_type in ('text','link','mixed','quiz'));

-- Deferral lets a single transaction safely reorder existing IDs.
alter table public.curriculum_weeks drop constraint curriculum_weeks_course_id_week_number_key;
alter table public.curriculum_weeks add constraint curriculum_weeks_course_id_week_number_key unique (course_id,week_number) deferrable initially immediate;
alter table public.curriculum_lessons drop constraint curriculum_lessons_week_id_day_number_key;
alter table public.curriculum_lessons add constraint curriculum_lessons_week_id_day_number_key unique (week_id,day_number) deferrable initially immediate;

-- Answers are deliberately NOT stored in public mission metadata.
create table public.mission_quizzes (
  mission_id uuid primary key references public.curriculum_missions(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 20),
  pass_percent integer not null default 100 check (pass_percent between 1 and 100)
);
alter table public.mission_quizzes enable row level security;
revoke all on public.mission_quizzes from public, anon, authenticated;
grant select on public.mission_quizzes to authenticated;
grant all on public.mission_quizzes to service_role;
create policy operators_read_quiz_keys on public.mission_quizzes for select to authenticated
  using ((select public.has_operator_permission('products')));

alter table public.mission_submissions add column quiz_required boolean not null default false;
alter table public.mission_submissions add column quiz_passed boolean;
alter table public.mission_submissions add constraint submission_quiz_gate check (not quiz_required or quiz_passed is true);

create table public.mission_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  mission_id uuid not null references public.curriculum_missions(id) on delete restrict,
  quiz_revision uuid not null,
  passed boolean not null,
  score integer not null check (score between 0 and 100),
  created_at timestamptz not null default now()
);
create index mission_quiz_attempts_rate_idx on public.mission_quiz_attempts(enrollment_id,mission_id,created_at desc);
create index mission_quiz_attempts_mission_idx on public.mission_quiz_attempts(mission_id);
alter table public.mission_quiz_attempts enable row level security;
revoke all on public.mission_quiz_attempts from public, anon, authenticated;
grant select on public.mission_quiz_attempts to authenticated;
grant all on public.mission_quiz_attempts to service_role;
create policy own_quiz_attempts on public.mission_quiz_attempts for select to authenticated using (
  exists (select 1 from public.enrollments e where e.id=enrollment_id and e.user_id=(select auth.uid()))
  or (select public.has_operator_permission('members'))
);

create table public.course_content_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.curriculum_lessons(id) on delete restrict,
  source text check (length(source)<=200),
  medium text check (length(medium)<=200),
  campaign text check (length(campaign)<=200),
  claimed_at timestamptz not null default now(),
  unique (user_id,lesson_id)
);
create index course_content_claims_lesson_idx on public.course_content_claims(lesson_id);
create index course_content_claims_recent_idx on public.course_content_claims(claimed_at desc);
alter table public.course_content_claims enable row level security;
revoke all on public.course_content_claims from public, anon, authenticated;
grant select on public.course_content_claims to authenticated;
grant all on public.course_content_claims to service_role;
create policy own_content_claims on public.course_content_claims for select to authenticated
  using (user_id=(select auth.uid()) or (select public.has_operator_permission('members')));

-- One transaction replaces the previous per-row HTTP waterfall. No enrollment,
-- order, progress, or review is recreated. Referenced items must be hidden instead.
create function public.save_course_curriculum(p_course_id uuid, p_actor uuid, p_weeks jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare w jsonb; l jsonb; m jsonb; q jsonb; wid uuid; lid uuid; mid uuid;
  week_ids uuid[] := '{}'; lesson_ids uuid[] := '{}'; wi integer:=0; li integer; day_no integer:=0;
begin
  if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('admin','staff')) then raise exception '운영자 권한이 필요합니다.'; end if;
  perform 1 from public.courses where id=p_course_id for update;
  if not found then raise exception '클래스를 찾을 수 없습니다.'; end if;
  if jsonb_typeof(p_weeks)<>'array' or jsonb_array_length(p_weeks)>52 then raise exception '섹션 구성이 올바르지 않습니다.'; end if;
  for w in select value from jsonb_array_elements(p_weeks) loop
    wid := (w->>'id')::uuid; week_ids := array_append(week_ids,wid);
    if exists(select 1 from public.curriculum_weeks where id=wid and course_id<>p_course_id) then raise exception '다른 클래스의 섹션입니다.'; end if;
    for l in select value from jsonb_array_elements(w->'lessons') loop
      lid := (l->>'id')::uuid; lesson_ids := array_append(lesson_ids,lid);
      if exists(select 1 from public.curriculum_lessons cl join public.curriculum_weeks cw on cw.id=cl.week_id where cl.id=lid and cw.course_id<>p_course_id) then raise exception '다른 클래스의 콘텐츠입니다.'; end if;
      if l->>'resourcePath' is not null and (l->>'resourcePath' not like p_course_id::text || '/%' or position('..' in l->>'resourcePath')>0) then raise exception '자료 경로를 확인해 주세요.'; end if;
    end loop;
  end loop;
  if exists(select 1 from public.curriculum_lessons cl join public.curriculum_weeks cw on cw.id=cl.week_id where cw.course_id=p_course_id and not(cl.id=any(lesson_ids)) and (
    exists(select 1 from public.lesson_progress lp where lp.lesson_id=cl.id) or
    exists(select 1 from public.course_content_claims cc where cc.lesson_id=cl.id) or
    exists(select 1 from public.curriculum_missions cm join public.mission_submissions ms on ms.mission_id=cm.id where cm.lesson_id=cl.id) or
    exists(select 1 from public.curriculum_missions cm join public.mission_quiz_attempts qa on qa.mission_id=cm.id where cm.lesson_id=cl.id)
  )) then raise exception '진도·제출·자료 이용 기록이 있는 콘텐츠는 삭제할 수 없습니다. 비공개로 전환해 주세요.'; end if;
  set constraints public.curriculum_weeks_course_id_week_number_key, public.curriculum_lessons_week_id_day_number_key deferred;
  for w in select value from jsonb_array_elements(p_weeks) loop
    wi:=wi+1; wid:=(w->>'id')::uuid;
    insert into public.curriculum_weeks(id,course_id,week_number,title,goal,is_published,display_order)
    values(wid,p_course_id,wi,w->>'title',nullif(w->>'goal',''),coalesce((w->>'isPublished')::boolean,true),wi-1)
    on conflict(id) do update set week_number=excluded.week_number,title=excluded.title,goal=excluded.goal,is_published=excluded.is_published,display_order=excluded.display_order;
    li:=0;
    for l in select value from jsonb_array_elements(w->'lessons') loop
      lid:=(l->>'id')::uuid; day_no:=day_no+1;
      insert into public.curriculum_lessons(id,week_id,day_number,title,description,content_type,duration_label,is_published,display_order,access_mode)
      values(lid,wid,day_no,l->>'title',nullif(l->>'description',''),case l->>'kind' when '자료' then 'material' when '텍스트' then 'text' when '링크' then 'link' else 'vod' end,nullif(l->>'duration',''),coalesce((l->>'isPublished')::boolean,true),li,coalesce(l->>'accessMode','enrolled'))
      on conflict(id) do update set week_id=excluded.week_id,day_number=excluded.day_number,title=excluded.title,description=excluded.description,content_type=excluded.content_type,duration_label=excluded.duration_label,is_published=excluded.is_published,display_order=excluded.display_order,access_mode=excluded.access_mode;
      li:=li+1;
      delete from public.lesson_contents where lesson_id=lid;
      if l->>'kind'='자료' and nullif(l->>'resourcePath','') is not null then
        insert into public.lesson_contents(lesson_id,resource_name,resource_storage_path) values(lid,l->>'resourceName',l->>'resourcePath');
      elsif l->>'kind'='텍스트' and nullif(l->>'bodyText','') is not null then
        insert into public.lesson_contents(lesson_id,body_text) values(lid,l->>'bodyText');
      elsif l->>'kind'='링크' and nullif(l->>'contentUrl','') is not null then
        insert into public.lesson_contents(lesson_id,external_url) values(lid,l->>'contentUrl');
      elsif l->>'kind'='VOD' and nullif(l->>'contentUrl','') is not null then
        insert into public.lesson_contents(lesson_id,vod_url) values(lid,l->>'contentUrl');
      end if;
      m:=l->'mission';
      if m is not null and m<>'null'::jsonb then
        insert into public.curriculum_missions(lesson_id,title,instructions,is_required,submission_type,is_published)
        values(lid,m->>'title',m->>'instructions',(m->>'required')::boolean,m->>'submissionType',(m->>'isPublished')::boolean)
        on conflict(lesson_id) do update set title=excluded.title,instructions=excluded.instructions,is_required=excluded.is_required,submission_type=excluded.submission_type,is_published=excluded.is_published returning id into mid;
        q:=m->'quiz';
        if q is not null and q<>'null'::jsonb then
          insert into public.mission_quizzes(mission_id,questions,pass_percent) values(mid,q->'questions',(q->>'passPercent')::integer)
          on conflict(mission_id) do update set questions=excluded.questions,pass_percent=excluded.pass_percent,
            revision=case when mission_quizzes.questions=excluded.questions and mission_quizzes.pass_percent=excluded.pass_percent then mission_quizzes.revision else gen_random_uuid() end;
        else delete from public.mission_quizzes where mission_id=mid;
        end if;
      else
        if exists(select 1 from public.curriculum_missions cm where cm.lesson_id=lid and (exists(select 1 from public.mission_submissions ms where ms.mission_id=cm.id) or exists(select 1 from public.mission_quiz_attempts qa where qa.mission_id=cm.id))) then raise exception '이력이 있는 과제는 해제할 수 없습니다. 과제를 비공개로 전환해 주세요.'; end if;
        delete from public.curriculum_missions where lesson_id=lid;
      end if;
    end loop;
  end loop;
  delete from public.curriculum_lessons cl using public.curriculum_weeks cw where cl.week_id=cw.id and cw.course_id=p_course_id and not(cl.id=any(lesson_ids));
  delete from public.curriculum_weeks where course_id=p_course_id and not(id=any(week_ids));
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data) values(p_actor,'curriculum.updated','course',p_course_id,jsonb_build_object('sections',wi,'lessons',day_no));
end;
$$;

-- Quiz result comes only from the authenticated server's grader. This RPC
-- rechecks enrollment, publication and revision inside a lock, closing races.
create function public.submit_learning_mission(p_user uuid,p_enrollment uuid,p_mission uuid,p_response jsonb,p_revision uuid,p_result jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare quiz public.mission_quizzes; attempt integer; sid uuid; course uuid;
begin
  select course_id into course from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.id=p_enrollment and e.user_id=p_user and e.status='active' and p.status='active' and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()) for update of e;
  if not found then raise exception '활성 수강권이 필요합니다.'; end if;
  perform 1 from public.courses where id=course for update;
  perform 1 from public.curriculum_missions m join public.curriculum_lessons l on l.id=m.lesson_id join public.curriculum_weeks w on w.id=l.week_id
    where m.id=p_mission and m.is_published and l.is_published and w.is_published and w.course_id=course;
  if not found then raise exception '현재 수강할 수 없는 과제입니다.'; end if;
  if exists(select 1 from public.mission_submissions where enrollment_id=p_enrollment and mission_id=p_mission and status in ('submitted','approved')) then raise exception '이미 제출했거나 승인된 과제입니다.'; end if;
  select * into quiz from public.mission_quizzes where mission_id=p_mission;
  if quiz.mission_id is not null then
    if p_revision is distinct from quiz.revision then raise exception '퀴즈가 변경되었습니다. 새로고침 후 다시 응시해 주세요.'; end if;
    if (select count(*) from public.mission_quiz_attempts where enrollment_id=p_enrollment and mission_id=p_mission and created_at>now()-interval '10 minutes')>=30 then raise exception '응시 횟수를 초과했습니다. 10분 후 다시 시도해 주세요.'; end if;
    if p_result is null or jsonb_typeof(p_result->'passed')<>'boolean' then raise exception '퀴즈 채점 결과가 필요합니다.'; end if;
    insert into public.mission_quiz_attempts(enrollment_id,mission_id,quiz_revision,passed,score) values(p_enrollment,p_mission,quiz.revision,(p_result->>'passed')::boolean,(p_result->>'score')::integer);
    if not (p_result->>'passed')::boolean then return jsonb_build_object('passed',false); end if;
  elsif p_revision is not null then raise exception '퀴즈 설정이 변경되었습니다. 새로고침해 주세요.';
  end if;
  select coalesce(max(attempt_number),0)+1 into attempt from public.mission_submissions where enrollment_id=p_enrollment and mission_id=p_mission;
  insert into public.mission_submissions(enrollment_id,mission_id,attempt_number,response,quiz_required,quiz_passed)
    values(p_enrollment,p_mission,attempt,p_response,quiz.mission_id is not null,case when quiz.mission_id is not null then true else null end) returning id into sid;
  return jsonb_build_object('passed',true,'submissionId',sid);
end;
$$;

create function public.review_mission_submissions(p_actor uuid,p_ids uuid[],p_decision text,p_feedback text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare s public.mission_submissions; n integer:=0;
begin
  if not exists(select 1 from public.profiles where id=p_actor and status='active' and role in ('admin','staff')) then raise exception '운영자 권한이 필요합니다.'; end if;
  if cardinality(p_ids) not between 1 and 50 or p_decision not in ('approved','rejected') or length(coalesce(p_feedback,''))>2000 or (p_decision='rejected' and length(btrim(coalesce(p_feedback,'')))=0) then raise exception '검토 대상과 피드백을 확인해 주세요.'; end if;
  for s in select * from public.mission_submissions where id=any(p_ids) order by id for update loop
    if s.status<>'submitted' then raise exception '이미 검토된 제출이 있습니다. 새로고침해 주세요.'; end if;
    update public.mission_submissions set status=p_decision,reviewed_at=now(),reviewed_by=p_actor,reviewer_feedback=nullif(btrim(p_feedback),'') where id=s.id;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
      values(p_actor,'mission_submission.'||p_decision,'mission_submission',s.id,jsonb_build_object('status',s.status),jsonb_build_object('status',p_decision,'feedback',p_feedback));
    n:=n+1;
  end loop;
  if n<>cardinality(p_ids) then raise exception '일부 제출 내역이 없습니다. 새로고침해 주세요.'; end if;
  return n;
end;
$$;
revoke all on function public.save_course_curriculum(uuid,uuid,jsonb),public.submit_learning_mission(uuid,uuid,uuid,jsonb,uuid,jsonb),public.review_mission_submissions(uuid,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.save_course_curriculum(uuid,uuid,jsonb),public.submit_learning_mission(uuid,uuid,uuid,jsonb,uuid,jsonb),public.review_mission_submissions(uuid,uuid[],text,text) to service_role;
-- Reviews must include a transactional audit record via the server route.
revoke update(status,reviewed_at,reviewed_by,reviewer_feedback) on public.mission_submissions from authenticated;

commit;
