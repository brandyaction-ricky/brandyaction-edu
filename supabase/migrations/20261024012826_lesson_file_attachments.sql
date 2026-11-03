begin;
-- Private downloadable lesson files reuse immutable course-scoped assets.
-- No public bucket, client Storage policies, or new RPC grants.
do $$ begin
 if not exists(select 1 from storage.buckets where id='lesson-content-media' and public=false) then
  raise exception 'Private lesson-content-media bucket required';
 end if;
end $$;
alter table public.edu_lesson_media drop constraint edu_lesson_media_kind_check;
alter table public.edu_lesson_media add constraint edu_lesson_media_kind_check check(kind in ('image','audio','video','file'));
update storage.buckets set allowed_mime_types = array(select distinct x from unnest(allowed_mime_types || array['application/octet-stream']) x)
 where id='lesson-content-media' and public=false;
create or replace function public.edu_prepare_lesson_media(p_actor uuid,p_course uuid,p_request uuid,p_spec jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.edu_lesson_media%rowtype; type_spec jsonb;
begin
 perform 1 from public.courses where id=p_course for share;
 perform 1 from public.profiles where id=p_actor for update;
 perform public.edu_assert_media_author(p_actor,p_course);
 type_spec:='{"png":["image","image/png"],"jpg":["image","image/jpeg"],"jpeg":["image","image/jpeg"],"webp":["image","image/webp"],"gif":["image","image/gif"],"mp3":["audio","audio/mpeg"],"wav":["audio","audio/wav"],"ogg":["audio","audio/ogg"],"m4a":["audio","audio/mp4"],"mp4":["video","video/mp4"],"webm":["video","video/webm"],"mov":["video","video/quicktime"],"pdf":["file","application/octet-stream"],"zip":["file","application/octet-stream"],"docx":["file","application/octet-stream"],"xlsx":["file","application/octet-stream"],"pptx":["file","application/octet-stream"],"hwp":["file","application/octet-stream"],"hwpx":["file","application/octet-stream"],"txt":["file","application/octet-stream"],"md":["file","application/octet-stream"],"csv":["file","application/octet-stream"]}'::jsonb->(p_spec->>'extension');
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
create or replace function public.edu_guard_lesson_media_refs()
returns trigger language plpgsql security invoker set search_path='' as $$
declare course uuid; b jsonb;
begin
 select w.course_id into course from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id where l.id=new.lesson_id for share of w;
 if exists(select 1 from jsonb_array_elements(new.document->'blocks') x where x->>'type'='file' and not (x ? 'assetId')) then raise exception 'BLOCK_MEDIA_INVALID'; end if;
 for b in select value from jsonb_array_elements(new.document->'blocks') where value ? 'assetId' loop
  if b ? 'url' or b->>'type' not in ('image','audio','video','file') or not exists(select 1 from public.edu_lesson_media f where
   f.id::text=b->>'assetId' and f.kind=b->>'type' and f.course_id=course and f.ready_at is not null) then raise exception 'BLOCK_MEDIA_INVALID'; end if;
 end loop;
 return new;
end;
$$;

revoke all on function public.edu_prepare_lesson_media(uuid,uuid,uuid,jsonb), public.edu_guard_lesson_media_refs() from public,anon,authenticated;
grant execute on function public.edu_prepare_lesson_media(uuid,uuid,uuid,jsonb), public.edu_guard_lesson_media_refs() to service_role;
commit;
