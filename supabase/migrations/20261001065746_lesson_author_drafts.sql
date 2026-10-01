begin;
set local lock_timeout='5s';

-- Author drafts are never part of student-facing reads. Versions are immutable.
create table public.edu_lesson_author_versions (
  id uuid primary key,
  lesson_id uuid not null references public.curriculum_lessons(id),
  payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=4000000),
  base_stamp text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  kind text not null default 'draft' check(kind in ('baseline','draft')),
  unique(lesson_id,id)
);
create index edu_lesson_author_history on public.edu_lesson_author_versions(lesson_id,created_at desc,id);
create table public.edu_lesson_author_heads (
  lesson_id uuid primary key references public.curriculum_lessons(id),
  revision uuid not null,
  published_revision uuid,
  published_stamp text,
  foreign key(lesson_id,revision) references public.edu_lesson_author_versions(lesson_id,id),
  foreign key(lesson_id,published_revision) references public.edu_lesson_author_versions(lesson_id,id)
);
create table public.edu_lesson_author_publications (
  id uuid primary key,
  lesson_id uuid not null references public.curriculum_lessons(id),
  revision uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key(lesson_id,revision) references public.edu_lesson_author_versions(lesson_id,id)
);
alter table public.edu_lesson_author_versions enable row level security;
alter table public.edu_lesson_author_heads enable row level security;
alter table public.edu_lesson_author_publications enable row level security;
revoke all on public.edu_lesson_author_versions,public.edu_lesson_author_heads,public.edu_lesson_author_publications from public,anon,authenticated;
grant select,insert on public.edu_lesson_author_versions,public.edu_lesson_author_publications to service_role;
grant select,insert,update on public.edu_lesson_author_heads to service_role;

create function public.edu_lesson_author_snapshot(p_actor uuid,p_lesson uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare l public.curriculum_lessons%rowtype; c public.lesson_contents%rowtype; doc jsonb; rev uuid;
begin
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  select * into l from public.curriculum_lessons where id=p_lesson;
  select * into c from public.lesson_contents where lesson_id=p_lesson;
  select h.revision,v.document into rev,doc from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision where h.lesson_id=p_lesson;
  return jsonb_build_object('stamp',md5(jsonb_build_array(to_jsonb(l),to_jsonb(c),rev)::text), 'blockRevision',rev,
    'payload',jsonb_build_object('form',jsonb_build_object('basic',jsonb_build_object('week_id',l.week_id,'day_number',l.day_number::text,'title',l.title,'description',coalesce(l.description,''),'duration_label',coalesce(l.duration_label,''),'is_published',l.is_published,'is_preview',l.is_preview),
    'format',l.content_type,'bodyText',coalesce(c.body_text,''),'videoUrl',coalesce(c.vod_url,''),'externalUrl',coalesce(c.external_url,''),'resourceName',coalesce(c.resource_name,''),'resourcePath',coalesce(c.resource_storage_path,'')),
    'blocks',jsonb_build_object('active',doc is not null,'document',coalesce(doc,'{"schemaVersion":1,"blocks":[],"checklist":[]}'::jsonb))));
end;
$$;
create function public.edu_read_lesson_author(p_actor uuid,p_lesson uuid,p_version uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare snap jsonb; head public.edu_lesson_author_heads%rowtype; v public.edu_lesson_author_versions%rowtype; items jsonb;
begin
  snap:=public.edu_lesson_author_snapshot(p_actor,p_lesson);
  select * into head from public.edu_lesson_author_heads where lesson_id=p_lesson;
  if p_version is not null then
    select * into v from public.edu_lesson_author_versions where lesson_id=p_lesson and id=p_version;
    if not found then raise exception 'AUTHOR_NOT_FOUND'; end if;
    return jsonb_build_object('payload',v.payload,'revision',v.id);
  end if;
  select * into v from public.edu_lesson_author_versions where id=head.revision;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]') into items from (
    select a.id,a.created_at,jsonb_build_object('revision',a.id,'createdAt',a.created_at,'title',a.payload->'form'->'basic'->>'title','baseline',a.kind='baseline',
      'published',exists(select 1 from public.edu_lesson_author_publications p where p.revision=a.id)) item
    from public.edu_lesson_author_versions a where a.lesson_id=p_lesson order by a.created_at desc,a.id desc limit 20
  ) history;
  return jsonb_build_object('lessonId',p_lesson,'public',snap,'revision',head.revision,'publishedRevision',head.published_revision,'publishedStamp',head.published_stamp,
    'payload',coalesce(v.payload,snap->'payload'),'baseStamp',coalesce(v.base_stamp,snap->>'stamp'),'history',items);
end;
$$;
create function public.edu_save_lesson_author(p_actor uuid,p_lesson uuid,p_expected uuid,p_request uuid,p_stamp text,p_payload jsonb,p_create boolean default false,p_rebase boolean default false) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare course uuid; target_course uuid; w uuid; head public.edu_lesson_author_heads%rowtype; old public.edu_lesson_author_versions%rowtype; snap jsonb; base text;
begin
  if not public.mission_operator_allowed(p_actor,'products') then raise exception 'AUTHOR_FORBIDDEN'; end if;
  if p_lesson is null or p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'AUTHOR_INVALID'; end if;
  w:=(p_payload->'form'->'basic'->>'week_id')::uuid;
  select course_id into target_course from public.curriculum_weeks where id=w and archived_at is null;
  select cw.course_id into course from public.curriculum_lessons l join public.curriculum_weeks cw on cw.id=l.week_id where l.id=p_lesson;
  course:=coalesce(course,target_course);
  if course is null or target_course is distinct from course then raise exception 'AUTHOR_COURSE_FIXED'; end if;
  perform 1 from public.courses where id=course and archived_at is null for update;
  if not found then raise exception 'AUTHOR_NOT_FOUND'; end if;
  perform 1 from public.curriculum_weeks where id=w and archived_at is null for update;
  if not found then raise exception 'AUTHOR_NOT_FOUND'; end if;
  perform 1 from public.curriculum_lessons where id=p_lesson for update;
  if not found then
    if not p_create or p_expected is not null then raise exception 'AUTHOR_NOT_FOUND'; end if;
    insert into public.curriculum_lessons(id,week_id,day_number,title,content_type,is_published,is_preview,display_order)
      values(p_lesson,w,(p_payload->'form'->'basic'->>'day_number')::integer,'새 수업','text',false,false,(p_payload->'form'->'basic'->>'day_number')::integer);
  elsif p_create and not exists(select 1 from public.edu_lesson_author_versions where id=p_request and lesson_id=p_lesson and created_by=p_actor) then
    raise exception 'AUTHOR_CHANGED';
  end if;
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  select * into old from public.edu_lesson_author_versions where id=p_request;
  if found then
    if old.lesson_id<>p_lesson or old.created_by<>p_actor or old.payload<>p_payload then raise exception 'AUTHOR_CHANGED'; end if;
    return jsonb_build_object('revision',old.id,'savedAt',old.created_at);
  end if;
  select * into head from public.edu_lesson_author_heads where lesson_id=p_lesson;
  if head.revision is distinct from p_expected then raise exception 'AUTHOR_CHANGED'; end if;
  snap:=public.edu_lesson_author_snapshot(p_actor,p_lesson);
  if p_stamp is distinct from snap->>'stamp' and not p_create then raise exception 'AUTHOR_PUBLIC_CHANGED'; end if;
  if head.revision is not null and not p_rebase then
    select * into old from public.edu_lesson_author_versions where id=head.revision;
    if old.base_stamp is distinct from snap->>'stamp' and not coalesce(head.revision=head.published_revision and head.published_stamp=snap->>'stamp',false) then raise exception 'AUTHOR_PUBLIC_CHANGED'; end if;
  end if;
  if head.revision is null then
    insert into public.edu_lesson_author_versions(id,lesson_id,payload,base_stamp,created_by,kind)
      values(gen_random_uuid(),p_lesson,snap->'payload',snap->>'stamp',p_actor,'baseline');
  end if;
  -- Saving explicitly uses the currently loaded public baseline. A stale draft
  -- can only be rebased via the editor's explicit restore-public workflow.
  base:=snap->>'stamp';
  insert into public.edu_lesson_author_versions(id,lesson_id,payload,base_stamp,created_by) values(p_request,p_lesson,p_payload,base,p_actor);
  insert into public.edu_lesson_author_heads(lesson_id,revision) values(p_lesson,p_request)
    on conflict(lesson_id) do update set revision=excluded.revision;
  return jsonb_build_object('revision',p_request,'savedAt',now(),'stamp',base);
end;
$$;
create function public.edu_publish_lesson_author(p_actor uuid,p_lesson uuid,p_revision uuid,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' set lock_timeout='5s' as $$
declare course uuid; target uuid; w uuid; head public.edu_lesson_author_heads%rowtype; v public.edu_lesson_author_versions%rowtype; receipt public.edu_lesson_author_publications%rowtype; snap jsonb; b jsonb; f jsonb; value text;
begin
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  select cw.course_id into course from public.curriculum_lessons l join public.curriculum_weeks cw on cw.id=l.week_id where l.id=p_lesson;
  perform 1 from public.courses where id=course and archived_at is null for update;
  perform pg_advisory_xact_lock(hashtextextended(course::text,261029));
  perform 1 from public.curriculum_lessons where id=p_lesson for update;
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  select * into receipt from public.edu_lesson_author_publications where id=p_request;
  if found then
    if receipt.lesson_id<>p_lesson or receipt.revision<>p_revision or receipt.created_by<>p_actor then raise exception 'AUTHOR_CHANGED'; end if;
    return jsonb_build_object('revision',p_revision,'published',true);
  end if;
  select * into head from public.edu_lesson_author_heads where lesson_id=p_lesson;
  if head.revision is distinct from p_revision then raise exception 'AUTHOR_CHANGED'; end if;
  select * into v from public.edu_lesson_author_versions where id=p_revision and lesson_id=p_lesson;
  if not found then raise exception 'AUTHOR_NOT_FOUND'; end if;
  snap:=public.edu_lesson_author_snapshot(p_actor,p_lesson);
  if v.base_stamp is distinct from snap->>'stamp' then raise exception 'AUTHOR_PUBLIC_CHANGED'; end if;
  f:=v.payload->'form'; b:=f->'basic'; w:=(b->>'week_id')::uuid;
  select course_id into target from public.curriculum_weeks where id=w and archived_at is null for update;
  if target is distinct from course then raise exception 'AUTHOR_COURSE_FIXED'; end if;
  if length(trim(b->>'title'))=0 or jsonb_typeof(b->'is_published') is distinct from 'boolean' or jsonb_typeof(b->'is_preview') is distinct from 'boolean' then raise exception 'AUTHOR_INVALID'; end if;
  update public.curriculum_lessons set week_id=w,day_number=(b->>'day_number')::integer,title=b->>'title',description=b->>'description',duration_label=b->>'duration_label',
    content_type=f->>'format',is_published=(b->>'is_published')::boolean,is_preview=(b->>'is_preview')::boolean,updated_at=clock_timestamp() where id=p_lesson;
  if (v.payload->'blocks'->>'active')::boolean then
    perform public.edu_save_lesson_blocks(p_actor,p_lesson,(snap->>'blockRevision')::uuid,p_request,v.payload->'blocks'->'document');
    -- Legacy supplemental resources remain attached when using interactive blocks.
  else
    if snap->>'blockRevision' is not null then raise exception 'AUTHOR_BLOCKS_REQUIRED'; end if;
    value:=nullif(trim(case f->>'format' when 'text' then f->>'bodyText' when 'vod' then f->>'videoUrl' when 'link' then f->>'externalUrl' when 'material' then f->>'resourcePath' end),'');
    if value is null then raise exception 'AUTHOR_INVALID'; end if;
    insert into public.lesson_contents(lesson_id,body_text,vod_url,external_url,resource_storage_path,resource_name)
      values(p_lesson,case when f->>'format'='text' then value end,case when f->>'format'='vod' then value end,case when f->>'format'='link' then value end,case when f->>'format'='material' then value end,nullif(f->>'resourceName',''))
      on conflict(lesson_id) do update set body_text=excluded.body_text,vod_url=excluded.vod_url,external_url=excluded.external_url,resource_storage_path=excluded.resource_storage_path,resource_name=excluded.resource_name,updated_at=clock_timestamp();
  end if;
  insert into public.edu_lesson_author_publications(id,lesson_id,revision,created_by) values(p_request,p_lesson,p_revision,p_actor);
  update public.edu_lesson_author_heads set published_revision=p_revision,published_stamp=public.edu_lesson_author_snapshot(p_actor,p_lesson)->>'stamp' where lesson_id=p_lesson;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_actor,'curriculum.lesson_published','curriculum_lessons',p_lesson::text,jsonb_build_object('stamp',snap->>'stamp'),jsonb_build_object('draftRevision',p_revision,'requestId',p_request));
  return jsonb_build_object('revision',p_revision,'published',true);
end;
$$;
revoke all on function public.edu_lesson_author_snapshot(uuid,uuid),public.edu_read_lesson_author(uuid,uuid,uuid),public.edu_save_lesson_author(uuid,uuid,uuid,uuid,text,jsonb,boolean,boolean),public.edu_publish_lesson_author(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_lesson_author_snapshot(uuid,uuid),public.edu_read_lesson_author(uuid,uuid,uuid),public.edu_save_lesson_author(uuid,uuid,uuid,uuid,text,jsonb,boolean,boolean),public.edu_publish_lesson_author(uuid,uuid,uuid,uuid) to service_role;
commit;
