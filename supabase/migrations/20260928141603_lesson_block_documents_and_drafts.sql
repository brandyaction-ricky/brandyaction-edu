begin;

-- These rows include paid content, answer keys and private drafts. They are
-- accessible only through the authenticated server routes/RPCs, never PostgREST
-- with an anon/authenticated client. Keep old lesson_contents unchanged.
create table public.edu_lesson_block_versions (
  id uuid primary key,
  lesson_id uuid not null references public.curriculum_lessons(id),
  document jsonb not null check (jsonb_typeof(document)='object' and document ?& array['schemaVersion','blocks','checklist'] and document->'schemaVersion'='1'::jsonb
    and jsonb_typeof(document->'blocks')='array' and jsonb_typeof(document->'checklist')='array'
    and octet_length(document::text)<=4000000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (lesson_id,id)
);
create index edu_lesson_block_versions_actor_idx on public.edu_lesson_block_versions(created_by);
create table public.edu_lesson_block_heads (
  lesson_id uuid primary key references public.curriculum_lessons(id),
  revision uuid not null,
  foreign key (lesson_id,revision) references public.edu_lesson_block_versions(lesson_id,id)
);
create table public.edu_lesson_block_drafts (
  enrollment_id uuid not null references public.enrollments(id),
  revision uuid not null references public.edu_lesson_block_versions(id),
  values jsonb not null check (jsonb_typeof(values)='object' and octet_length(values::text)<=1000000),
  write_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (enrollment_id,revision)
);
create index edu_lesson_block_drafts_revision_idx on public.edu_lesson_block_drafts(revision);
alter table public.edu_lesson_block_versions enable row level security;
alter table public.edu_lesson_block_heads enable row level security;
alter table public.edu_lesson_block_drafts enable row level security;
revoke all on public.edu_lesson_block_versions,public.edu_lesson_block_heads,public.edu_lesson_block_drafts from public,anon,authenticated;
grant select,insert on public.edu_lesson_block_versions to service_role;
grant select,insert,update on public.edu_lesson_block_heads,public.edu_lesson_block_drafts to service_role;

create function public.edu_assert_block_access(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_edit boolean default false)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare can_edit boolean;
begin
  if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'BLOCK_FORBIDDEN'; end if;
  select exists(select 1 from public.profiles p where p.id=p_actor and (p.role='admin' or
    (p.role='staff' and exists(select 1 from public.site_settings s where s.key='edu_staff_permissions_'||p.id::text and s.value->'products'='true'::jsonb)))) into can_edit;
  if not exists(select 1 from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    join public.courses c on c.id=w.course_id where l.id=p_lesson and l.archived_at is null and w.archived_at is null and c.archived_at is null)
    then raise exception 'BLOCK_NOT_FOUND'; end if;
  if p_edit then
    if not can_edit then raise exception 'BLOCK_FORBIDDEN'; end if;
    return true;
  end if;
  if can_edit and p_enrollment is null then return true; end if;
  -- Even an administrator must own an enrollment when saving learner answers.
  if not exists(select 1 from public.enrollments e
    join public.curriculum_weeks w on w.course_id=e.course_id join public.curriculum_lessons l on l.week_id=w.id
    where e.id=p_enrollment and e.user_id=p_actor and l.id=p_lesson
    and l.is_published and w.is_published and e.status='active' and e.revoked_at is null
    and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now()))
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  return false;
end;
$$;

create function public.edu_read_lesson_blocks(p_actor uuid,p_lesson uuid,p_enrollment uuid default null,p_revision uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare editable boolean; current_id uuid; v public.edu_lesson_block_versions%rowtype; d public.edu_lesson_block_drafts%rowtype;
begin
  editable:=public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
  select revision into current_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  select * into v from public.edu_lesson_block_versions where id=coalesce(p_revision,current_id) and lesson_id=p_lesson;
  if p_revision is not null and v.id is null then raise exception 'BLOCK_NOT_FOUND'; end if;
  -- Old private drafts remain readable with their original questions. Do not
  -- expose arbitrary historical content to a learner who never wrote in it.
  if not editable and v.id is distinct from current_id and not exists(select 1 from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id)
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  select * into d from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id;
  return jsonb_build_object('editable',editable,'revision',v.id,'currentRevision',current_id,'document',v.document,
    'draft',case when d.revision is null then null else jsonb_build_object('values',d.values,'writeId',d.write_id,'updatedAt',d.updated_at) end,
    'previousDrafts',coalesce((select jsonb_agg(jsonb_build_object('revision',dv.revision,'updatedAt',dv.updated_at) order by dv.updated_at desc)
      from public.edu_lesson_block_drafts dv join public.edu_lesson_block_versions bv on bv.id=dv.revision
      where dv.enrollment_id=p_enrollment and bv.lesson_id=p_lesson and dv.revision is distinct from current_id),'[]'::jsonb));
end;
$$;

create function public.edu_save_lesson_blocks(p_actor uuid,p_lesson uuid,p_expected_revision uuid,p_new_revision uuid,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare head_id uuid; v public.edu_lesson_block_versions%rowtype;
begin
  perform public.edu_assert_block_access(p_actor,p_lesson,null,true);
  if p_new_revision is null or p_document is null then raise exception 'BLOCK_INVALID'; end if;
  -- Lock a row that already exists even for the first edit: two authors cannot
  -- both create competing initial versions and silently replace one another.
  perform 1 from public.curriculum_lessons where id=p_lesson for update;
  select * into v from public.edu_lesson_block_versions where id=p_new_revision;
  if found then
    if v.lesson_id<>p_lesson or v.created_by<>p_actor or v.document<>p_document then raise exception 'BLOCK_REQUEST_REUSED'; end if;
    return jsonb_build_object('revision',v.id);
  end if;
  select revision into head_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  if head_id is distinct from p_expected_revision then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
  insert into public.edu_lesson_block_versions(id,lesson_id,document,created_by) values(p_new_revision,p_lesson,p_document,p_actor);
  insert into public.edu_lesson_block_heads(lesson_id,revision) values(p_lesson,p_new_revision)
    on conflict(lesson_id) do update set revision=excluded.revision;
  return jsonb_build_object('revision',p_new_revision);
end;
$$;

create function public.edu_save_block_draft(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_expected_write uuid,p_write uuid,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.edu_lesson_block_drafts%rowtype; head_id uuid;
begin
  if p_enrollment is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
  if p_write is null or p_revision is null or p_values is null then raise exception 'BLOCK_INVALID'; end if;
  perform 1 from public.curriculum_lessons where id=p_lesson for share;
  select revision into head_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  if head_id is distinct from p_revision then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
  if p_expected_write is null then
    insert into public.edu_lesson_block_drafts(enrollment_id,revision,values,write_id) values(p_enrollment,p_revision,p_values,p_write)
      on conflict do nothing returning * into d;
    if found then return jsonb_build_object('writeId',d.write_id,'updatedAt',d.updated_at); end if;
  end if;
  select * into d from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=p_revision for update;
  if not found then raise exception 'BLOCK_DRAFT_CHANGED'; end if;
  if d.write_id=p_write then
    if d.values<>p_values then raise exception 'BLOCK_REQUEST_REUSED'; end if;
    return jsonb_build_object('writeId',d.write_id,'updatedAt',d.updated_at);
  end if;
  if d.write_id is distinct from p_expected_write then raise exception 'BLOCK_DRAFT_CHANGED'; end if;
  update public.edu_lesson_block_drafts set values=p_values,write_id=p_write,updated_at=now()
    where enrollment_id=p_enrollment and revision=p_revision returning * into d;
  return jsonb_build_object('writeId',d.write_id,'updatedAt',d.updated_at);
end;
$$;

revoke all on function public.edu_assert_block_access(uuid,uuid,uuid,boolean), public.edu_read_lesson_blocks(uuid,uuid,uuid,uuid),
  public.edu_save_lesson_blocks(uuid,uuid,uuid,uuid,jsonb), public.edu_save_block_draft(uuid,uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_assert_block_access(uuid,uuid,uuid,boolean), public.edu_read_lesson_blocks(uuid,uuid,uuid,uuid),
  public.edu_save_lesson_blocks(uuid,uuid,uuid,uuid,jsonb), public.edu_save_block_draft(uuid,uuid,uuid,uuid,uuid,uuid,jsonb) to service_role;

commit;
