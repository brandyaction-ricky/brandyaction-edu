begin;

-- Media metadata is copied per destination course; immutable Storage bytes are
-- shared, never moved, overwritten or made public. Every reader still authorizes
-- the destination lesson/enrollment through its own asset id. Cleanup must retain
-- a storage path while ANY media row refers to it.
alter table public.edu_lesson_media add column source_asset_id uuid references public.edu_lesson_media(id);
create index edu_lesson_media_source_asset on public.edu_lesson_media(source_asset_id);
alter table public.edu_lesson_media drop constraint edu_lesson_media_path_key;
alter table public.edu_lesson_media add constraint edu_lesson_media_course_path_key unique(course_id,path);
create index edu_lesson_media_path on public.edu_lesson_media(path);

create function public.edu_guard_copied_media()
returns trigger language plpgsql security invoker set search_path='' as $$
declare original public.edu_lesson_media%rowtype;
begin
 if new.source_asset_id is not null then
  select * into original from public.edu_lesson_media where id=new.source_asset_id;
  if not found or original.ready_at is null or new.course_id=original.course_id
   or row(new.kind,new.name,new.size,new.content_type,new.extension,new.path,new.sha256,new.ready_at)
      is distinct from row(original.kind,original.name,original.size,original.content_type,original.extension,original.path,original.sha256,original.ready_at)
   then raise exception 'COPY_MEDIA_INVALID'; end if;
 end if;
 return new;
end;
$$;
create trigger edu_copied_media before insert or update on public.edu_lesson_media
 for each row execute function public.edu_guard_copied_media();
revoke all on function public.edu_guard_copied_media() from public,anon,authenticated;
grant execute on function public.edu_guard_copied_media() to service_role;


-- Copying references does not consume the actual-upload hourly quota.
create or replace function public.edu_prepare_lesson_media(p_actor uuid,p_course uuid,p_request uuid,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_lesson_media%rowtype; type_spec jsonb;
begin
 perform 1 from public.courses where id=p_course for share;
 perform 1 from public.profiles where id=p_actor for update;
 perform public.edu_assert_media_author(p_actor,p_course);
 type_spec:='{"png":["image","image/png"],"jpg":["image","image/jpeg"],"jpeg":["image","image/jpeg"],"webp":["image","image/webp"],"gif":["image","image/gif"],"mp3":["audio","audio/mpeg"],"wav":["audio","audio/wav"],"ogg":["audio","audio/ogg"],"m4a":["audio","audio/mp4"],"mp4":["video","video/mp4"],"webm":["video","video/webm"],"mov":["video","video/quicktime"]}'::jsonb->(p_spec->>'extension');
 if p_request is null or p_spec is null or type_spec is null or type_spec->>0 is distinct from p_spec->>'kind' or type_spec->>1 is distinct from p_spec->>'contentType'
  or coalesce((p_spec->>'size')::integer,0) not between 1 and (case p_spec->>'kind' when 'image' then 10485760 else 52428800 end)
  or coalesce(length(p_spec->>'name'),0) not between 1 and 240 then raise exception 'BLOCK_INVALID'; end if;
 select * into f from public.edu_lesson_media where id=p_request;
 if found then
  if f.owner_id<>p_actor or f.course_id<>p_course or f.kind is distinct from p_spec->>'kind' or f.name is distinct from p_spec->>'name' or
   f.size is distinct from (p_spec->>'size')::integer or f.extension is distinct from p_spec->>'extension' or f.content_type is distinct from p_spec->>'contentType' then raise exception 'BLOCK_REQUEST_REUSED'; end if;
 else
  if (select count(*)>=500 or coalesce(sum(size),0)+(p_spec->>'size')::integer>1073741824 from public.edu_lesson_media where owner_id=p_actor and source_asset_id is null and created_at>now()-interval '1 hour') then raise exception 'BLOCK_UPLOAD_LIMIT'; end if;
  insert into public.edu_lesson_media(id,owner_id,course_id,kind,name,size,content_type,extension,path)
   values(p_request,p_actor,p_course,p_spec->>'kind',p_spec->>'name',(p_spec->>'size')::integer,p_spec->>'contentType',p_spec->>'extension',p_course::text||'/'||p_request::text||'.'||(p_spec->>'extension')) returning * into f;
 end if;
 return to_jsonb(f);
end;
$$;
-- One statement supplies a consistent source snapshot, including quiz definitions.
-- Only the server can read this payload (it contains protected lesson content).
create or replace function public.edu_curriculum_copy_snapshot(p_source uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  -- Parse each current document once, even when many blocks share one file.
  with current_blocks as materialized (
    select l.id as lesson_id,v.id as revision,v.document
    from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    join public.edu_lesson_block_heads h on h.lesson_id=l.id join public.edu_lesson_block_versions v on v.id=h.revision
    where w.course_id=p_source and w.archived_at is null and l.archived_at is null
  ), media_ids as (
    select distinct b->>'assetId' as id from current_blocks,
    lateral jsonb_array_elements(document->'blocks') b where b ? 'assetId'
  )
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
    'blocks', coalesce((select jsonb_agg(to_jsonb(v) order by v.lesson_id) from current_blocks v),'[]'::jsonb),
    'media', coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.edu_lesson_media f
      join media_ids refs on refs.id=f.id::text where f.course_id=c.id and f.ready_at is not null),'[]'::jsonb),
    'ongoing', coalesce((select jsonb_agg(jsonb_build_object('lesson_id',l.id,'cadence',r.cadence) order by l.id)
      from public.edu_ongoing_rules r join public.curriculum_lessons l on l.id=r.lesson_id
      join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=c.id and w.archived_at is null and l.archived_at is null),'[]'::jsonb),
    'quizzes', coalesce((select jsonb_agg(to_jsonb(q) order by q.mission_id)
      from public.mission_quizzes q join public.curriculum_missions m on m.id=q.mission_id
      join public.curriculum_lessons l on l.id=m.lesson_id join public.curriculum_weeks w on w.id=l.week_id
      where w.course_id=c.id and w.archived_at is null and l.archived_at is null and m.archived_at is null),'[]'::jsonb)
  ) from public.courses c where c.id=p_source and c.archived_at is null
    and c.status<>'archived' and c.category in ('free','paid_class');
$$;
revoke all on function public.edu_curriculum_copy_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.edu_curriculum_copy_snapshot(uuid) to service_role;

create or replace function public.edu_copy_product_curriculum(p_actor uuid,p_request uuid,p_source uuid,p_target uuid,p_revision text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  target public.courses%rowtype; receipt public.edu_mutation_receipts%rowtype;
  snapshot jsonb; item jsonb; new_id uuid; weeks_map jsonb:='{}'; lessons_map jsonb:='{}'; missions_map jsonb:='{}';
  resources jsonb:='[]'; copy_result jsonb; fingerprint text; media_map jsonb:='{}'; document jsonb;
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
    or jsonb_array_length(snapshot->'lessons')>1000 or octet_length(snapshot::text)>10485760
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
  -- Clone course-scoped metadata once per referenced file, not per block. The
  -- same immutable private bytes can back independent destination definitions.
  for item in select value from jsonb_array_elements(snapshot->'media') loop
    new_id:=gen_random_uuid(); media_map:=media_map||jsonb_build_object(item->>'id',new_id);
    insert into public.edu_lesson_media(id,owner_id,course_id,kind,name,size,content_type,extension,path,sha256,ready_at,source_asset_id)
      values(new_id,p_actor,p_target,item->>'kind',item->>'name',(item->>'size')::integer,item->>'content_type',item->>'extension',
        item->>'path',item->>'sha256',(item->>'ready_at')::timestamptz,(item->>'id')::uuid);
  end loop;
  for item in select value from jsonb_array_elements(snapshot->'blocks') loop
    document:=item->'document';
    if exists(select 1 from jsonb_array_elements(document->'blocks') b where b ? 'assetId' and not media_map ? (b->>'assetId'))
      then raise exception 'COPY_MEDIA_INVALID'; end if;
    document:=jsonb_set(document,'{blocks}',coalesce((select jsonb_agg(
      case when b ? 'assetId' then jsonb_set(b,'{assetId}',media_map->(b->>'assetId')) else b end order by n)
      from jsonb_array_elements(document->'blocks') with ordinality a(b,n)),'[]'::jsonb));
    perform public.edu_save_lesson_blocks(p_actor,(lessons_map->>(item->>'lesson_id'))::uuid,null,gen_random_uuid(),document);
  end loop;
  for item in select value from jsonb_array_elements(snapshot->'ongoing') loop
    perform public.edu_configure_ongoing(p_actor,(lessons_map->>(item->>'lesson_id'))::uuid,item->>'cadence',gen_random_uuid());
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
    'missions',jsonb_array_length(snapshot->'missions'),'quizzes',jsonb_array_length(snapshot->'quizzes'),'resources',jsonb_array_length(resources),
    'interactiveLessons',jsonb_array_length(snapshot->'blocks'),'privateMedia',jsonb_array_length(snapshot->'media'),'ongoingLessons',jsonb_array_length(snapshot->'ongoing'));
  update public.edu_mutation_receipts set result=copy_result where actor_id=p_actor and request_id=p_request;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,'curriculum.copied','courses',p_target::text,copy_result||jsonb_build_object('requestId',p_request));
  return copy_result;
end; $$;
revoke all on function public.edu_copy_product_curriculum(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.edu_copy_product_curriculum(uuid,uuid,uuid,uuid,text) to service_role;

-- Preview exposes counts and a revision, never protected bodies or quiz answers.
create or replace function public.edu_preview_curriculum_copy(p_actor uuid,p_source uuid)
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
    'quizzes',jsonb_array_length(snapshot->'quizzes'),'resources',jsonb_array_length(snapshot->'resources'),
    'interactiveLessons',jsonb_array_length(snapshot->'blocks'),'privateMedia',jsonb_array_length(snapshot->'media'),'ongoingLessons',jsonb_array_length(snapshot->'ongoing'));
end; $$;
revoke all on function public.edu_preview_curriculum_copy(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_preview_curriculum_copy(uuid,uuid) to service_role;
commit;
