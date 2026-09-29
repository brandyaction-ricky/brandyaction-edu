begin;

-- Filter the latest attempt per enrollment/lesson before pagination. The old
-- three-argument queue RPC remains available to previously deployed clients.
create function public.edu_search_block_submissions(
  p_actor uuid, p_state text default 'submitted', p_page integer default 1,
  p_query text default '', p_track text default '', p_day integer default null,
  p_sort text default 'latest', p_member uuid default null
)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  perform public.edu_assert_block_reviewer(p_actor);
  if p_page is null or p_page not between 1 and 100000 or p_state is null or
    p_state not in ('','submitted','approved','changes_requested','reopened','completed') or
    p_query is null or length(p_query)>100 or p_track is null or p_track not in ('','daily','learning','other') or
    (p_day is not null and p_day not between 0 and 30) or p_sort is null or p_sort not in ('latest','oldest','day_asc','day_desc')
    then raise exception 'BLOCK_INVALID'; end if;
  with latest as materialized (
    select distinct on(s.enrollment_id,s.lesson_id) s.*
    from public.edu_lesson_block_submissions s
    join public.enrollments e on e.id=s.enrollment_id join public.profiles p on p.id=e.user_id
    where (p_member is null or p.id=p_member) and (btrim(p_query)='' or
      strpos(lower(coalesce(p.full_name,'')),lower(btrim(p_query)))>0 or
      strpos(lower(coalesce(p.email,'')),lower(btrim(p_query)))>0 or
      strpos(coalesce(p.phone,''),btrim(p_query))>0 or strpos(p.id::text,lower(btrim(p_query)))>0)
    order by s.enrollment_id,s.lesson_id,s.sequence desc
  ), receipts as (
    select s.*,public.edu_block_submission_receipt(s) as receipt,
      coalesce(v.document->'progression'->>'track','other') as track,
      coalesce((v.document->'progression'->>'dayNumber')::integer,l.day_number) as day_number,
      p.full_name as member_name,p.email as member_email,c.title as course_title,l.title as lesson_title
    from latest s join public.edu_lesson_block_versions v on v.id=s.revision
    join public.enrollments e on e.id=s.enrollment_id join public.profiles p on p.id=e.user_id
    join public.courses c on c.id=e.course_id join public.curriculum_lessons l on l.id=s.lesson_id
  ), filtered as materialized (
    select * from receipts s where (p_state='' or s.receipt->>'state'=p_state)
      and (p_track='' or s.track=p_track) and (p_day is null or s.day_number=p_day)
  ), ranked as (
    select f.*,row_number() over(order by
      case when p_sort='day_asc' then f.day_number end asc nulls last,
      case when p_sort='day_desc' then f.day_number end desc nulls last,
      case when p_sort='oldest' then f.sequence end asc,
      case when p_sort<>'oldest' then f.sequence end desc,f.id) as position
    from filtered f
  ) select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,'pageSize',20,
    'rows',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'submission',f.receipt,
      'memberName',f.member_name,'memberEmail',f.member_email,'courseTitle',f.course_title,'lessonTitle',f.lesson_title,
      'track',f.track,'dayNumber',f.day_number) order by f.position)
      from (select * from ranked order by position limit 20 offset (p_page-1)*20) f),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.edu_search_block_submissions(uuid,text,integer,text,text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_search_block_submissions(uuid,text,integer,text,text,integer,text,uuid) to service_role;

-- Read-only operator projection. Progress and access continue to be owned by
-- their existing records/gate; this endpoint never approves or opens a lesson.
create function public.edu_admin_learning_progress(
  p_actor uuid, p_member uuid default null, p_query text default '',
  p_page integer default 1, p_cohort uuid default null
)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb:='[]'; total integer; enrollment_summary record; tr record; item jsonb; groups jsonb;
  first_incomplete integer; next_day integer; current_day integer; finished boolean; state text;
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
    result:=result||jsonb_build_array(jsonb_build_object('enrollmentId',enrollment_summary.id,'memberId',enrollment_summary.user_id,'memberName',enrollment_summary.full_name,
      'memberEmail',enrollment_summary.email,'courseTitle',enrollment_summary.course_title,'cohortName',enrollment_summary.cohort_name,'accessActive',coalesce(enrollment_summary.access_active,false),'status',state,'tracks',groups));
  end loop;
  return jsonb_build_object('rows',result,'total',coalesce(total,0),'page',p_page,'pageSize',20);
end;
$$;
revoke all on function public.edu_admin_learning_progress(uuid,uuid,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.edu_admin_learning_progress(uuid,uuid,text,integer,uuid) to service_role;

commit;
