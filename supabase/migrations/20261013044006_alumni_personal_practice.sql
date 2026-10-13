begin;

-- Personal drafts never replace submitted answers, review events or credited progress.
create table public.edu_alumni_practice_drafts (
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  lesson_id uuid not null,
  revision uuid not null,
  values jsonb not null check (jsonb_typeof(values)='object' and values ?& array['blocks','checklist'] and jsonb_typeof(values->'blocks')='object' and jsonb_typeof(values->'checklist')='array' and octet_length(values::text)<=1000000),
  write_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (enrollment_id,revision),
  foreign key (lesson_id,revision) references public.edu_lesson_block_versions(lesson_id,id)
);
create index edu_alumni_practice_revision_idx on public.edu_alumni_practice_drafts(revision);
alter table public.edu_alumni_practice_drafts enable row level security;
revoke all on public.edu_alumni_practice_drafts from public,anon,authenticated;
grant select,insert,update on public.edu_alumni_practice_drafts to service_role;
create trigger edu_alumni_practice_files before insert or update on public.edu_alumni_practice_drafts for each row execute function public.edu_guard_answer_file_refs();

create function public.edu_assert_alumni_practice_access(p_actor uuid,p_lesson uuid,p_enrollment uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  -- Existing assertion checks owner, profile, lifetime entitlement, publication
  -- and cohort visibility before it can raise the progression-only exception.
  begin
    perform public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
  exception when raise_exception then
    if sqlerrm <> 'BLOCK_LESSON_LOCKED' or not public.edu_is_graduate_enrollment(p_enrollment) then raise; end if;
  end;
  if p_enrollment is null or not public.edu_is_graduate_enrollment(p_enrollment) then raise exception 'BLOCK_FORBIDDEN'; end if;
end; $$;

create function public.edu_read_alumni_practice(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare d public.edu_alumni_practice_drafts%rowtype;
begin
  if not public.edu_is_graduate_enrollment(p_enrollment) then return jsonb_build_object('enabled',false,'draft',null); end if;
  perform public.edu_assert_alumni_practice_access(p_actor,p_lesson,p_enrollment);
  if not exists(select 1 from public.edu_lesson_block_versions where id=p_revision and lesson_id=p_lesson) then raise exception 'BLOCK_NOT_FOUND'; end if;
  select * into d from public.edu_alumni_practice_drafts where enrollment_id=p_enrollment and revision=p_revision;
  return jsonb_build_object('enabled',true,'draft',case when d.revision is null then null else jsonb_build_object('values',d.values,'writeId',d.write_id,'updatedAt',d.updated_at) end);
end; $$;

create function public.edu_save_alumni_practice(p_actor uuid,p_lesson uuid,p_enrollment uuid,p_revision uuid,p_expected_write uuid,p_write uuid,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.edu_alumni_practice_drafts%rowtype; head_id uuid;
begin
  perform 1 from public.curriculum_lessons where id=p_lesson for share;
  perform 1 from public.enrollments where id=p_enrollment for update;
  perform public.edu_assert_alumni_practice_access(p_actor,p_lesson,p_enrollment);
  if p_write is null or p_revision is null or p_values is null or jsonb_typeof(p_values->'blocks') is distinct from 'object'
    or jsonb_typeof(p_values->'checklist') is distinct from 'array' or octet_length(p_values::text)>1000000 then raise exception 'BLOCK_INVALID'; end if;
  select revision into head_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  if head_id is distinct from p_revision then raise exception 'BLOCK_CONTENT_CHANGED'; end if;
  if p_expected_write is null then
    insert into public.edu_alumni_practice_drafts(enrollment_id,lesson_id,revision,values,write_id) values(p_enrollment,p_lesson,p_revision,p_values,p_write)
      on conflict do nothing returning * into d;
    if found then return jsonb_build_object('writeId',d.write_id,'updatedAt',d.updated_at); end if;
  end if;
  select * into d from public.edu_alumni_practice_drafts where enrollment_id=p_enrollment and revision=p_revision for update;
  if not found then raise exception 'BLOCK_DRAFT_CHANGED'; end if;
  if d.write_id=p_write then
    if d.values<>p_values then raise exception 'BLOCK_REQUEST_REUSED'; end if;
    return jsonb_build_object('writeId',d.write_id,'updatedAt',d.updated_at);
  end if;
  if d.write_id is distinct from p_expected_write then raise exception 'BLOCK_DRAFT_CHANGED'; end if;
  update public.edu_alumni_practice_drafts set values=p_values,write_id=p_write,updated_at=now() where enrollment_id=p_enrollment and revision=p_revision returning * into d;
  return jsonb_build_object('writeId',d.write_id,'updatedAt',d.updated_at);
end; $$;

-- Keep personal answers on older curriculum versions readable alongside existing history.
create or replace function public.edu_read_lesson_blocks(p_actor uuid,p_lesson uuid,p_enrollment uuid default null,p_revision uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare editable boolean; current_id uuid; v public.edu_lesson_block_versions%rowtype; d public.edu_lesson_block_drafts%rowtype; s public.edu_lesson_block_submissions%rowtype;
begin
  begin
    editable:=public.edu_assert_block_access(p_actor,p_lesson,p_enrollment);
  exception when raise_exception then
    if sqlerrm = 'BLOCK_LESSON_LOCKED' and public.edu_is_graduate_enrollment(p_enrollment) then
      editable:=false;
    else raise; end if;
  end;
  select revision into current_id from public.edu_lesson_block_heads where lesson_id=p_lesson;
  select * into v from public.edu_lesson_block_versions where id=coalesce(p_revision,current_id) and lesson_id=p_lesson;
  if p_revision is not null and v.id is null then raise exception 'BLOCK_NOT_FOUND'; end if;
  if not editable and v.id is distinct from current_id and not exists(select 1 from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id)
    and not exists(select 1 from public.edu_ongoing_rounds where enrollment_id=p_enrollment and lesson_id=p_lesson and revision=v.id)
    and not exists(select 1 from public.edu_alumni_practice_drafts where enrollment_id=p_enrollment and revision=v.id)
    then raise exception 'BLOCK_FORBIDDEN'; end if;
  select * into d from public.edu_lesson_block_drafts where enrollment_id=p_enrollment and revision=v.id;
  select * into s from public.edu_lesson_block_submissions where enrollment_id=p_enrollment and revision=v.id order by sequence desc limit 1;
  return jsonb_build_object('ongoing',(select cadence from public.edu_ongoing_rules where lesson_id=p_lesson),'submissions',coalesce((select jsonb_agg(public.edu_block_submission_receipt(h) order by h.sequence desc) from public.edu_lesson_block_submissions h where h.enrollment_id=p_enrollment and h.revision=v.id),'[]'::jsonb),'submission',case when s.id is null then null else public.edu_block_submission_receipt(s) end,'editable',editable,'revision',v.id,'currentRevision',current_id,'document',v.document,
    'draft',case when d.revision is null then null else jsonb_build_object('values',d.values,'writeId',d.write_id,'updatedAt',d.updated_at) end,
    'previousDrafts',coalesce((select jsonb_agg(jsonb_build_object('revision',dv.revision,'updatedAt',dv.updated_at) order by dv.updated_at desc)
      from (select revision,max(updated_at) updated_at from (select revision,updated_at from public.edu_lesson_block_drafts where enrollment_id=p_enrollment
        union all select revision,updated_at from public.edu_alumni_practice_drafts where enrollment_id=p_enrollment) versions group by revision) dv
      join public.edu_lesson_block_versions bv on bv.id=dv.revision where bv.lesson_id=p_lesson and dv.revision is distinct from current_id),'[]'::jsonb));
end;
$$;

-- Enforce the official-participation boundary even through direct server RPCs.
-- Existing RLS still authorizes client writes. This private trigger only reads
-- inaccessible graduate status to deny writes; it never grants or writes data.
create function edu_private.edu_guard_alumni_participation()
returns trigger language plpgsql security definer set search_path='' as $$
declare enrollment uuid;
begin
  if current_setting('role',true) in ('anon','authenticated') and
    (auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and status='active')) then
    raise exception 'BLOCK_FORBIDDEN';
  end if;
  if tg_table_name in ('edu_lesson_block_reviews','edu_lesson_block_feedback') then
    select enrollment_id into enrollment from public.edu_lesson_block_submissions where id=new.submission_id;
  else enrollment:=new.enrollment_id;
  end if;
  if public.edu_is_graduate_enrollment(enrollment) then raise exception 'ALUMNI_PARTICIPATION_CLOSED'; end if;
  return new;
end; $$;
create trigger edu_alumni_block_submission before insert on public.edu_lesson_block_submissions for each row execute function edu_private.edu_guard_alumni_participation();
create trigger edu_alumni_block_review before insert on public.edu_lesson_block_reviews for each row execute function edu_private.edu_guard_alumni_participation();
create trigger edu_alumni_block_feedback before insert on public.edu_lesson_block_feedback for each row execute function edu_private.edu_guard_alumni_participation();
create trigger edu_alumni_mission_submission before insert or update on public.mission_submissions for each row execute function edu_private.edu_guard_alumni_participation();
create trigger edu_alumni_ongoing_completion before insert on public.edu_ongoing_completions for each row execute function edu_private.edu_guard_alumni_participation();
create trigger edu_alumni_official_progress before insert or update on public.lesson_progress for each row execute function edu_private.edu_guard_alumni_participation();

revoke all on function public.edu_assert_alumni_practice_access(uuid,uuid,uuid),public.edu_read_alumni_practice(uuid,uuid,uuid,uuid),public.edu_save_alumni_practice(uuid,uuid,uuid,uuid,uuid,uuid,jsonb),edu_private.edu_guard_alumni_participation() from public,anon,authenticated;
grant execute on function public.edu_assert_alumni_practice_access(uuid,uuid,uuid),public.edu_read_alumni_practice(uuid,uuid,uuid,uuid),public.edu_save_alumni_practice(uuid,uuid,uuid,uuid,uuid,uuid,jsonb),edu_private.edu_guard_alumni_participation() to service_role;
commit;
