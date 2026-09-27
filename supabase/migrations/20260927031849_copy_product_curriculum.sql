begin;

-- One statement supplies a consistent source snapshot, including quiz definitions.
-- Only the server can read this payload (it contains protected lesson content).
create function public.edu_curriculum_copy_snapshot(p_source uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'course', jsonb_build_object('id',c.id,'title',c.title),
    'resources', coalesce(c.metadata->'product_resources','[]'::jsonb),
    'weeks', coalesce((select jsonb_agg(to_jsonb(w) order by w.week_number,w.id)
      from public.curriculum_weeks w where w.course_id=c.id and w.archived_at is null),'[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(l) order by l.week_id,l.day_number,l.id)
      from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=c.id and w.archived_at is null and l.archived_at is null),'[]'::jsonb),
    'contents', coalesce((select jsonb_agg(to_jsonb(t) order by t.lesson_id)
      from public.lesson_contents t join public.curriculum_lessons l on l.id=t.lesson_id
      join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=c.id and w.archived_at is null and l.archived_at is null),'[]'::jsonb),
    'missions', coalesce((select jsonb_agg(to_jsonb(m) order by m.id)
      from public.curriculum_missions m join public.curriculum_lessons l on l.id=m.lesson_id
      join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=c.id and w.archived_at is null and l.archived_at is null and m.archived_at is null),'[]'::jsonb),
    'quizzes', coalesce((select jsonb_agg(to_jsonb(q) order by q.mission_id)
      from public.mission_quizzes q join public.curriculum_missions m on m.id=q.mission_id
      join public.curriculum_lessons l on l.id=m.lesson_id join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=c.id and w.archived_at is null and l.archived_at is null and m.archived_at is null),'[]'::jsonb)
  ) from public.courses c where c.id=p_source and c.archived_at is null
    and c.status<>'archived' and c.category in ('free','paid_class');
$$;
revoke all on function public.edu_curriculum_copy_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.edu_curriculum_copy_snapshot(uuid) to service_role;

create function public.edu_copy_product_curriculum(p_actor uuid,p_request uuid,p_source uuid,p_target uuid,p_revision text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  target public.courses%rowtype; receipt public.edu_mutation_receipts%rowtype;
  snapshot jsonb; item jsonb; new_id uuid; weeks_map jsonb:='{}'; lessons_map jsonb:='{}'; missions_map jsonb:='{}';
  resources jsonb:='[]'; copy_result jsonb; fingerprint text;
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active'
    and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s
      where s.key='edu_staff_permissions_'||p.id::text and s.value->'products'='true'::jsonb))))
    then raise exception 'COPY_FORBIDDEN'; end if;
  if p_request is null or p_source is null or p_target is null or p_source=p_target
    or p_revision is null or p_revision !~ '^[a-f0-9]{32}$' then raise exception 'COPY_INVALID'; end if;
  fingerprint:=md5(p_source::text||p_target::text||p_revision);
  insert into public.edu_mutation_receipts(actor_id,request_id,target_table,fingerprint)
    values(p_actor,p_request,'curriculum_copy',fingerprint) on conflict do nothing;
  select * into receipt from public.edu_mutation_receipts where actor_id=p_actor and request_id=p_request for update;
  if receipt.target_table<>'curriculum_copy' or receipt.fingerprint<>fingerprint then raise exception 'COPY_REQUEST_REUSED'; end if;
  if receipt.result is not null then return receipt.result; end if;

  -- Serializes competing copies and product publication. The full operation rolls back on failure.
  select * into target from public.courses where id=p_target for update;
  if not found or target.archived_at is not null or target.status<>'draft'
    or target.category not in ('free','paid_class') or target.category is null then raise exception 'COPY_TARGET_DRAFT'; end if;
  if exists(select 1 from public.curriculum_weeks where course_id=p_target)
    or coalesce(target.metadata->'product_resources','[]'::jsonb)<>'[]'::jsonb
    then raise exception 'COPY_TARGET_NOT_EMPTY'; end if;
  snapshot:=public.edu_curriculum_copy_snapshot(p_source);
  if snapshot is null then raise exception 'COPY_SOURCE_MISSING'; end if;
  if md5(snapshot::text)<>p_revision then raise exception 'COPY_SOURCE_CHANGED'; end if;
  if jsonb_array_length(snapshot->'weeks') not between 1 and 100
    or jsonb_array_length(snapshot->'lessons')>1000 or pg_column_size(snapshot)>10485760
    then raise exception 'COPY_SOURCE_LIMIT'; end if;
  if jsonb_typeof(snapshot->'resources')<>'array' or jsonb_array_length(snapshot->'resources')>30 then raise exception 'COPY_RESOURCE_INVALID'; end if;

  for item in select value from jsonb_array_elements(snapshot->'weeks') loop
    new_id:=gen_random_uuid(); weeks_map:=weeks_map||jsonb_build_object(item->>'id',new_id);
    insert into public.curriculum_weeks(id,course_id,week_number,title,goal,is_published,display_order)
      values(new_id,p_target,(item->>'week_number')::integer,item->>'title',item->>'goal',false,(item->>'display_order')::integer);
  end loop;
  for item in select value from jsonb_array_elements(snapshot->'lessons') loop
    new_id:=gen_random_uuid(); lessons_map:=lessons_map||jsonb_build_object(item->>'id',new_id);
    insert into public.curriculum_lessons(id,week_id,day_number,title,description,content_type,duration_label,is_preview,is_published,display_order,access_mode)
      values(new_id,(weeks_map->>(item->>'week_id'))::uuid,(item->>'day_number')::integer,item->>'title',item->>'description',item->>'content_type',item->>'duration_label',false,false,(item->>'display_order')::integer,item->>'access_mode');
  end loop;
  for item in select value from jsonb_array_elements(snapshot->'contents') loop
    insert into public.lesson_contents(lesson_id,vod_url,resource_name,resource_storage_path,body_text,external_url)
      values((lessons_map->>(item->>'lesson_id'))::uuid,item->>'vod_url',item->>'resource_name',item->>'resource_storage_path',item->>'body_text',item->>'external_url');
  end loop;
  for item in select value from jsonb_array_elements(snapshot->'missions') loop
    new_id:=gen_random_uuid(); missions_map:=missions_map||jsonb_build_object(item->>'id',new_id);
    insert into public.curriculum_missions(id,lesson_id,title,instructions,is_required,submission_type,is_published)
      values(new_id,(lessons_map->>(item->>'lesson_id'))::uuid,item->>'title',item->>'instructions',(item->>'is_required')::boolean,item->>'submission_type',false);
    -- Some deployed environments already have the mission form extension.
    -- Preserve its definition without adding/changing that independently owned column.
    if item ? 'form_schema' then
      execute 'update public.curriculum_missions set form_schema=$1 where id=$2' using item->'form_schema',new_id;
    end if;
  end loop;
  for item in select value from jsonb_array_elements(snapshot->'quizzes') loop
    insert into public.mission_quizzes(mission_id,revision,questions,pass_percent)
      values((missions_map->>(item->>'mission_id'))::uuid,gen_random_uuid(),item->'questions',(item->>'pass_percent')::integer);
  end loop;
  -- Files are immutable uploads: copy references, never move or delete the originals.
  for item in select value from jsonb_array_elements(snapshot->'resources') loop
    if jsonb_typeof(item)<>'object' or coalesce(item->>'name','')='' or length(item->>'name')>240
      or coalesce(item->>'path','') !~* '^edu/[a-z0-9-]+\.[a-z0-9]{1,12}$'
      or coalesce(item->>'scope','') not in ('public','authenticated','enrolled','purchaser')
      then raise exception 'COPY_RESOURCE_INVALID'; end if;
    resources:=resources||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name',item->>'name','path',item->>'path','scope',item->>'scope'));
  end loop;
  update public.courses set metadata=jsonb_set(metadata,'{product_resources}',resources),updated_at=now() where id=p_target;
  copy_result:=jsonb_build_object('targetId',p_target,'sourceId',p_source,'weeks',jsonb_array_length(snapshot->'weeks'),
    'lessons',jsonb_array_length(snapshot->'lessons'),'contents',jsonb_array_length(snapshot->'contents'),
    'missions',jsonb_array_length(snapshot->'missions'),'quizzes',jsonb_array_length(snapshot->'quizzes'),'resources',jsonb_array_length(resources));
  update public.edu_mutation_receipts set result=copy_result where actor_id=p_actor and request_id=p_request;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,'curriculum.copied','courses',p_target::text,copy_result||jsonb_build_object('requestId',p_request));
  return copy_result;
end; $$;
revoke all on function public.edu_copy_product_curriculum(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_copy_product_curriculum(uuid,uuid,uuid,uuid,text) to service_role;

-- Preview exposes counts and a revision, never protected bodies or quiz answers.
create function public.edu_preview_curriculum_copy(p_actor uuid,p_source uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb;
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active'
    and (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s
      where s.key='edu_staff_permissions_'||p.id::text and s.value->'products'='true'::jsonb))))
    then raise exception 'COPY_FORBIDDEN'; end if;
  snapshot:=public.edu_curriculum_copy_snapshot(p_source);
  if snapshot is null then raise exception 'COPY_SOURCE_MISSING'; end if;
  return jsonb_build_object('sourceId',p_source,'title',snapshot->'course'->>'title','revision',md5(snapshot::text),
    'weeks',jsonb_array_length(snapshot->'weeks'),'lessons',jsonb_array_length(snapshot->'lessons'),
    'contents',jsonb_array_length(snapshot->'contents'),'missions',jsonb_array_length(snapshot->'missions'),
    'quizzes',jsonb_array_length(snapshot->'quizzes'),'resources',jsonb_array_length(snapshot->'resources'));
end; $$;
revoke all on function public.edu_preview_curriculum_copy(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_preview_curriculum_copy(uuid,uuid) to service_role;
commit;
