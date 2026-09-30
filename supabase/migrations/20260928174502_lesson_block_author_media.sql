begin;
-- Private author uploads, reusable only within the same course. Published JSON
-- stores immutable asset IDs, never signed URLs. No client Storage policies.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('lesson-content-media','lesson-content-media',false,52428800,array['image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/wav','audio/ogg','audio/mp4','video/mp4','video/webm','video/quicktime']);
create table public.edu_lesson_media (
 id uuid primary key, owner_id uuid not null references public.profiles(id), course_id uuid not null references public.courses(id),
 kind text not null check(kind in ('image','audio','video')), name text not null check(length(name) between 1 and 240),
 size integer not null check(size between 1 and 52428800), content_type text not null, extension text not null,
 path text not null unique, sha256 text check(sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(), ready_at timestamptz,
 check ((ready_at is null) = (sha256 is null)), check(kind<>'image' or size<=10485760)
);
create index edu_lesson_media_owner_created on public.edu_lesson_media(owner_id,created_at);
create index edu_lesson_media_course on public.edu_lesson_media(course_id);
alter table public.edu_lesson_media enable row level security;
revoke all on public.edu_lesson_media from public,anon,authenticated;
grant select,insert on public.edu_lesson_media to service_role;
grant update(sha256,ready_at) on public.edu_lesson_media to service_role;

create function public.edu_assert_media_author(p_actor uuid,p_course uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=p_actor and p.status='active' and
  (p.role='admin' or (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and s.value->'products'='true'::jsonb))))
  then raise exception 'BLOCK_FORBIDDEN'; end if;
 if not exists(select 1 from public.courses where id=p_course and archived_at is null) then raise exception 'BLOCK_NOT_FOUND'; end if;
end;
$$;
create function public.edu_prepare_lesson_media(p_actor uuid,p_course uuid,p_request uuid,p_spec jsonb)
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
  if (select count(*)>=500 or coalesce(sum(size),0)+(p_spec->>'size')::integer>1073741824 from public.edu_lesson_media where owner_id=p_actor and created_at>now()-interval '1 hour') then raise exception 'BLOCK_UPLOAD_LIMIT'; end if;
  insert into public.edu_lesson_media(id,owner_id,course_id,kind,name,size,content_type,extension,path)
   values(p_request,p_actor,p_course,p_spec->>'kind',p_spec->>'name',(p_spec->>'size')::integer,p_spec->>'contentType',p_spec->>'extension',p_course::text||'/'||p_request::text||'.'||(p_spec->>'extension')) returning * into f;
 end if;
 return to_jsonb(f);
end;
$$;
create function public.edu_owned_lesson_media(p_actor uuid,p_asset uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f public.edu_lesson_media%rowtype;
begin
 select * into f from public.edu_lesson_media where id=p_asset and owner_id=p_actor;
 if not found then raise exception 'BLOCK_FORBIDDEN'; end if;
 perform public.edu_assert_media_author(p_actor,f.course_id);
 return to_jsonb(f);
end;
$$;
create function public.edu_complete_lesson_media(p_actor uuid,p_asset uuid,p_sha256 text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_lesson_media%rowtype;
begin
 perform public.edu_owned_lesson_media(p_actor,p_asset);
 if p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' then raise exception 'BLOCK_INVALID'; end if;
 select * into f from public.edu_lesson_media where id=p_asset for update;
 if f.sha256 is not null and f.sha256<>p_sha256 then raise exception 'BLOCK_REQUEST_REUSED'; end if;
 update public.edu_lesson_media set sha256=p_sha256,ready_at=coalesce(ready_at,now()) where id=p_asset returning * into f;
 return jsonb_build_object('id',f.id,'name',f.name,'kind',f.kind,'size',f.size);
end;
$$;
create function public.edu_guard_lesson_media_refs()
returns trigger language plpgsql security invoker set search_path='' as $$
declare course uuid; b jsonb;
begin
 select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=new.lesson_id for share of w;
 for b in select value from jsonb_array_elements(new.document->'blocks') where value ? 'assetId' loop
  if b ? 'url' or b->>'type' not in ('image','audio','video') or not exists(select 1 from public.edu_lesson_media f where
   f.id::text=b->>'assetId' and f.kind=b->>'type' and f.course_id=course and f.ready_at is not null) then raise exception 'BLOCK_MEDIA_INVALID'; end if;
 end loop;
 return new;
end;
$$;
create trigger edu_lesson_media_refs before insert on public.edu_lesson_block_versions for each row execute function public.edu_guard_lesson_media_refs();
-- Prevent moving a lesson/week across courses after private media was bound.
-- Otherwise a metadata save alone could accidentally expose paid materials.
create function public.edu_guard_media_course_move()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='curriculum_lessons' then
  if old.week_id is distinct from new.week_id and exists(select 1 from public.edu_lesson_block_versions v, lateral jsonb_array_elements(v.document->'blocks') b
   join public.edu_lesson_media f on f.id::text=b->>'assetId' where v.lesson_id=new.id and f.course_id is distinct from (select course_id from public.curriculum_weeks where id=new.week_id)) then raise exception 'BLOCK_MEDIA_COURSE_MOVE'; end if;
 else
  if old.course_id is distinct from new.course_id and exists(select 1 from public.curriculum_lessons l join public.edu_lesson_block_versions v on v.lesson_id=l.id,
   lateral jsonb_array_elements(v.document->'blocks') b join public.edu_lesson_media f on f.id::text=b->>'assetId' where l.week_id=new.id and f.course_id<>new.course_id) then raise exception 'BLOCK_MEDIA_COURSE_MOVE'; end if;
 end if;
 return new;
end;
$$;
create trigger edu_media_lesson_course before update of week_id on public.curriculum_lessons for each row execute function public.edu_guard_media_course_move();
create trigger edu_media_week_course before update of course_id on public.curriculum_weeks for each row execute function public.edu_guard_media_course_move();

create function public.edu_read_lesson_media(p_actor uuid,p_asset uuid,p_lesson uuid default null,p_enrollment uuid default null,p_revision uuid default null,p_submission uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare f public.edu_lesson_media%rowtype; detail jsonb; owned_enrollment uuid;
begin
 select * into f from public.edu_lesson_media where id=p_asset and ready_at is not null;
 if not found then raise exception 'BLOCK_NOT_FOUND'; end if;
 if p_submission is not null then
  select s.enrollment_id into owned_enrollment from public.edu_lesson_block_submissions s join public.enrollments e on e.id=s.enrollment_id where s.id=p_submission and e.user_id=p_actor;
  detail:=public.edu_read_block_submission(p_actor,p_submission,owned_enrollment);
 elsif p_lesson is not null then
  detail:=public.edu_read_lesson_blocks(p_actor,p_lesson,p_enrollment,p_revision);
 else
  -- Author preview, including a new lesson that has not been saved yet.
  perform public.edu_assert_media_author(p_actor,f.course_id);
  return to_jsonb(f);
 end if;
 if not exists(select 1 from jsonb_array_elements(detail->'document'->'blocks') b where b->>'assetId'=f.id::text and b->>'type'=f.kind) then raise exception 'BLOCK_FORBIDDEN'; end if;
 return to_jsonb(f);
end;
$$;
revoke all on function public.edu_assert_media_author(uuid,uuid),public.edu_prepare_lesson_media(uuid,uuid,uuid,jsonb),public.edu_owned_lesson_media(uuid,uuid),public.edu_complete_lesson_media(uuid,uuid,text),public.edu_guard_lesson_media_refs(),public.edu_guard_media_course_move(),public.edu_read_lesson_media(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_assert_media_author(uuid,uuid),public.edu_prepare_lesson_media(uuid,uuid,uuid,jsonb),public.edu_owned_lesson_media(uuid,uuid),public.edu_complete_lesson_media(uuid,uuid,text),public.edu_guard_lesson_media_refs(),public.edu_guard_media_course_move(),public.edu_read_lesson_media(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
