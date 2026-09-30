begin;
-- Share one current-day calculation between the admin overview and message
-- targeting. No completion, access or answer records are changed here.
create function public.edu_enrollment_track_summary(p_enrollment uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare enrollment_summary record; tr record; item jsonb; groups jsonb;
  first_incomplete integer; next_day integer; current_day integer; finished boolean; state text;
begin
  select e.*, (p.status='active' and e.status='active' and e.revoked_at is null and e.access_starts_at<=now()
    and (e.access_ends_at is null or e.access_ends_at>now())) as access_active into enrollment_summary
    from public.enrollments e join public.profiles p on p.id=e.user_id where e.id=p_enrollment;
  if not found then raise exception 'BLOCK_INVALID'; end if;
    groups:='[]'; state:='ready';
    begin
      for tr in
        with lessons as (
          select l.id,v.document->'progression'->>'track' as track,
            (v.document->'progression'->>'dayNumber')::integer as day,
            exists(select 1 from public.lesson_progress p where p.enrollment_id=enrollment_summary.id and p.lesson_id=l.id and p.completed_at is not null) as done
          from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
          join public.edu_lesson_block_heads h on h.lesson_id=l.id join public.edu_lesson_block_versions v on v.id=h.revision
          where w.course_id=enrollment_summary.course_id and w.is_published and l.is_published and w.archived_at is null and l.archived_at is null
            and v.document->'progression'->>'track' in ('daily','learning')
        ) select track,count(*)::integer as total,count(*) filter(where done)::integer as completed,
          count(distinct day)::integer as unique_days,max(day) as last_day,
          jsonb_agg(jsonb_build_object('id',id,'day',day,'done',done) order by day,id) as lessons
          from lessons group by track order by track
      loop
        if tr.total<>tr.unique_days then raise exception 'BLOCK_PROGRESSION_DUPLICATE'; end if;
        first_incomplete:=null; next_day:=null; finished:=tr.completed=tr.total;
        for item in select value from jsonb_array_elements(tr.lessons) loop
          if (item->>'done')::boolean then continue; end if;
          first_incomplete:=coalesce(first_incomplete,(item->>'day')::integer);
          if enrollment_summary.access_active and (public.edu_lesson_progression_gate(enrollment_summary.id,(item->>'id')::uuid)->>'isUnlocked')::boolean then
            next_day:=(item->>'day')::integer; exit;
          end if;
        end loop;
        current_day:=coalesce(next_day,first_incomplete,tr.last_day);
        groups:=groups||jsonb_build_array(jsonb_build_object('track',tr.track,'total',tr.total,'completed',tr.completed,
          'currentDay',current_day,'nextDay',next_day,'waiting',enrollment_summary.access_active and not finished and next_day is null,'finished',finished));
      end loop;
    exception when raise_exception then
      if sqlerrm not in ('BLOCK_PROGRESSION_DUPLICATE','BLOCK_INVALID','BLOCK_FORBIDDEN') then raise; end if;
      groups:='[]';state:='error';
    end;
  return jsonb_build_object('status',state,'tracks',groups);
end;
$$;

create or replace function public.edu_admin_learning_progress(
  p_actor uuid, p_member uuid default null, p_query text default '',
  p_page integer default 1, p_cohort uuid default null
)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb:='[]'; total integer; enrollment_summary record; summary jsonb;
begin
  perform public.edu_assert_block_reviewer(p_actor);
  if p_query is null or length(p_query)>100 or p_page is null or p_page not between 1 and 100000
    then raise exception 'BLOCK_INVALID'; end if;
  -- Materializing the selected page keeps expensive gate reads bounded to
  -- at most 20 enrollments. The count and rows share the exact same filter.
  for enrollment_summary in
    with filtered as materialized (
      select e.id,e.user_id,e.course_id,p.full_name,p.email,c.title as course_title,h.name as cohort_name,
        (p.status='active' and e.status='active' and e.revoked_at is null and e.access_starts_at<=now()
          and (e.access_ends_at is null or e.access_ends_at>now())) as access_active
      from public.enrollments e join public.profiles p on p.id=e.user_id
      join public.courses c on c.id=e.course_id left join public.cohorts h on h.id=e.cohort_id
      where p.status<>'withdrawn' and (p_member is null or p.id=p_member) and (p_cohort is null or e.cohort_id=p_cohort)
        and (p_member is not null or (p.status='active' and e.status='active' and e.revoked_at is null and e.access_starts_at<=now()
          and (e.access_ends_at is null or e.access_ends_at>now())))
        and (btrim(p_query)='' or strpos(lower(coalesce(p.full_name,'')),lower(btrim(p_query)))>0 or
          strpos(lower(coalesce(p.email,'')),lower(btrim(p_query)))>0 or strpos(coalesce(p.phone,''),btrim(p_query))>0 or strpos(p.id::text,lower(btrim(p_query)))>0)
    ) select page.*,counts.total_count from (select count(*)::integer as total_count from filtered) counts
      left join lateral (select * from filtered order by full_name nulls last,user_id,id limit 20 offset (p_page-1)*20) page on true
      order by page.full_name nulls last,page.user_id,page.id
  loop
    total:=enrollment_summary.total_count;
    if enrollment_summary.id is null then continue; end if;
    summary:=public.edu_enrollment_track_summary(enrollment_summary.id);
    result:=result||jsonb_build_array(jsonb_build_object('enrollmentId',enrollment_summary.id,'memberId',enrollment_summary.user_id,'memberName',enrollment_summary.full_name,
      'memberEmail',enrollment_summary.email,'courseTitle',enrollment_summary.course_title,'cohortName',enrollment_summary.cohort_name,'accessActive',coalesce(enrollment_summary.access_active,false),'status',summary->>'status','tracks',summary->'tracks'));
  end loop;
  return jsonb_build_object('rows',result,'total',coalesce(total,0),'page',p_page,'pageSize',20);
end;
$$;
revoke all on function public.edu_admin_learning_progress(uuid,uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.edu_admin_learning_progress(uuid,uuid,text,integer,uuid) to service_role;

-- Exact progress scope is part of the send receipt. Callers cannot silently
-- broaden an existing request after the response is lost.
create function public.edu_assert_message_progress(p_progress jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_progress is null or jsonb_typeof(p_progress)<>'object' then raise exception 'MESSAGE_INVALID'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_progress) k) is distinct from array['cohortId','day','track']::text[]
    or jsonb_typeof(p_progress->'cohortId')<>'string' or (p_progress->>'cohortId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_progress->'track')<>'string' or (p_progress->>'track') not in ('daily','learning')
    or jsonb_typeof(p_progress->'day')<>'number' or (p_progress->>'day')!~'^([1-9]|[12][0-9]|30)$'
    then raise exception 'MESSAGE_INVALID'; end if;
end;
$$;

create function public.edu_member_matches_message_progress(p_member uuid,p_progress jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare enrollment_id uuid; summary jsonb;
begin
  perform public.edu_assert_message_progress(p_progress);
  for enrollment_id in
    select e.id from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.user_id=p_member and e.cohort_id=(p_progress->>'cohortId')::uuid and p.status='active' and p.role='student'
      and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now())
  loop
    summary:=public.edu_enrollment_track_summary(enrollment_id);
    if summary->>'status'='ready' and exists(select 1 from jsonb_array_elements(summary->'tracks') t
      where t->>'track'=p_progress->>'track' and (t->>'currentDay')::integer=(p_progress->>'day')::integer
        and not (t->>'finished')::boolean) then return true; end if;
  end loop;
  return false;
end;
$$;

create function public.edu_message_progress_cohorts(p_actor uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if not public.edu_message_operator(p_actor) then raise exception 'MESSAGE_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'courseTitle',c.title) order by c.title,h.name,h.id),'[]') into result
  from public.cohorts h join public.courses c on c.id=h.course_id
  where exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
    where e.cohort_id=h.id and e.course_id=h.course_id and p.role='student' and p.status='active'
      and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()));
  return jsonb_build_object('rows',result);
end;
$$;

create function public.edu_message_progress_recipients(p_actor uuid,p_search text,p_after uuid,p_progress jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare items jsonb; next_id uuid; has_more boolean;
begin
  if not public.edu_message_operator(p_actor) then raise exception 'MESSAGE_FORBIDDEN'; end if;
  perform public.edu_assert_message_progress(p_progress);
  if p_search is null or length(p_search)>100 then raise exception 'MESSAGE_INVALID'; end if;
  with page as materialized (
    select p.id,p.full_name,p.email from public.profiles p
    where p.status='active' and p.role='student' and p.id<>p_actor and (p_after is null or p.id>p_after)
      and (p_search='' or strpos(lower(coalesce(p.full_name,'')||' '||coalesce(p.email,'')),lower(p_search))>0)
      and exists(select 1 from public.enrollments e where e.user_id=p.id and e.cohort_id=(p_progress->>'cohortId')::uuid
        and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
      and public.edu_member_matches_message_progress(p.id,p_progress)
    order by p.id limit 26
  ), visible as (select * from page order by id limit 25)
  select coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',full_name,'email',email) order by id) from visible),'[]'::jsonb),
    (select id from visible order by id desc limit 1),(select count(*)>25 from page) into items,next_id,has_more;
  return jsonb_build_object('rows',items,'nextCursor',case when has_more then next_id else null end);
end;
$$;

create function public.edu_send_progress_message(p_actor uuid,p_request uuid,p_content text,p_recipients uuid[],p_progress jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare targets uuid[]; body jsonb; previous public.edu_message_batches%rowtype; result jsonb; p_reply uuid:=null; p_ongoing uuid:=null;
begin
 perform public.edu_assert_message_actor(p_actor);
 if not public.edu_message_operator(p_actor) then raise exception 'MESSAGE_FORBIDDEN'; end if;
 perform public.edu_assert_message_progress(p_progress);
 if p_request is null or p_content is null or length(p_content)>5000 or p_content!~'[^[:space:]]' or
  p_recipients is null or cardinality(p_recipients)>100 or array_position(p_recipients,null) is not null or
  (p_reply is not null and cardinality(p_recipients)>0) then raise exception 'MESSAGE_INVALID'; end if;
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into targets from unnest(p_recipients) x;
 body=jsonb_build_object('content',p_content,'recipients',targets,'replyTo',p_reply,'ongoingLesson',p_ongoing,'progress',p_progress);
 -- Serialize all sends by one actor, including request replay and rate checks.
 perform pg_advisory_xact_lock(hashtextextended('edu-message:'||p_actor::text,0));
 select * into previous from public.edu_message_batches where actor_id=p_actor and request_id=p_request;
 if found then
  if previous.payload<>body then raise exception 'MESSAGE_REQUEST_REUSED'; end if;
  return previous.receipt;
 end if;
 if cardinality(targets)=0 then raise exception 'MESSAGE_INVALID'; end if;
 if exists(select 1 from unnest(targets) t left join public.profiles p on p.id=t
  where p.id is null or p.status<>'active' or p.status is null or p.id=p_actor) then raise exception 'MESSAGE_RECIPIENT_UNAVAILABLE'; end if;
 if exists(select 1 from unnest(targets) t where not public.edu_member_matches_message_progress(t,p_progress))
   then raise exception 'MESSAGE_PROGRESS_CHANGED'; end if;
 if (select count(*) from public.edu_message_batches where actor_id=p_actor and created_at>now()-interval '1 minute')>=20 then raise exception 'MESSAGE_RATE_LIMIT'; end if;
 insert into public.edu_message_batches(actor_id,request_id,payload) values(p_actor,p_request,body);
 insert into public.edu_member_messages(sender_id,recipient_id,request_id,content,reply_to)
  select p_actor,t,p_request,p_content,p_reply from unnest(targets) t;
 select jsonb_build_object('requestId',p_request,'count',count(*),'messageIds',jsonb_agg(id order by sequence),'createdAt',min(created_at)) into result
  from public.edu_member_messages where sender_id=p_actor and request_id=p_request;
 update public.edu_message_batches set receipt=result where actor_id=p_actor and request_id=p_request;
 return result;
end;
$$;

revoke all on function public.edu_enrollment_track_summary(uuid) from public,anon,authenticated;
grant execute on function public.edu_enrollment_track_summary(uuid) to service_role;
revoke all on function public.edu_assert_message_progress(jsonb) from public,anon,authenticated;
grant execute on function public.edu_assert_message_progress(jsonb) to service_role;
revoke all on function public.edu_member_matches_message_progress(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_member_matches_message_progress(uuid,jsonb) to service_role;
revoke all on function public.edu_message_progress_cohorts(uuid) from public,anon,authenticated;
grant execute on function public.edu_message_progress_cohorts(uuid) to service_role;
revoke all on function public.edu_message_progress_recipients(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_message_progress_recipients(uuid,text,uuid,jsonb) to service_role;
revoke all on function public.edu_send_progress_message(uuid,uuid,text,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.edu_send_progress_message(uuid,uuid,text,uuid[],jsonb) to service_role;

commit;
