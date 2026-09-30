begin;

-- Track which mission archive state was introduced by hiding its lesson, so a
-- later lesson restore never revives a mission that was already archived.
alter table public.curriculum_missions
  add column if not exists archived_by_curriculum boolean not null default false;

-- Removing curriculum entries from the active outline must not erase learner
-- progress, submissions, questions, or uploaded resources. Keep an audited,
-- reversible archive state instead of cascading deletes.
create or replace function public.edu_set_curriculum_archive(
  p_actor uuid,
  p_course uuid,
  p_kind text,
  p_id uuid,
  p_archived boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  affected integer := 0;
  target_week uuid;
begin
  if p_kind not in ('week','lesson') or p_archived is null then
    raise exception 'CURRICULUM_INVALID';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=p_actor and p.status='active'
      and (p.role='admin' or (p.role='staff' and exists(
        select 1 from public.site_settings s
        where s.key='edu_staff_permissions_'||p_actor::text
          and s.value->'products'='true'::jsonb
      )))
  ) then raise exception 'CURRICULUM_FORBIDDEN'; end if;

  perform 1 from public.courses where id=p_course for update;
  if not found then raise exception 'CURRICULUM_NOT_FOUND'; end if;

  if p_kind='week' then
    perform 1 from public.curriculum_weeks where id=p_id and course_id=p_course for update;
    if not found then raise exception 'CURRICULUM_NOT_FOUND'; end if;

    update public.curriculum_weeks
      set archived_at=case when p_archived then now() else null end,
          is_published=case when p_archived then false else is_published end
      where id=p_id and course_id=p_course;
    get diagnostics affected=row_count;

    -- A restored week remains private. Restore its lessons separately so the
    -- operator can review each item before it appears in the active outline.
    if p_archived then
      update public.curriculum_lessons
        set archived_at=now(), is_published=false
        where week_id=p_id and archived_at is null;
      update public.curriculum_missions m
        set archived_at=now(), is_published=false, archived_by_curriculum=true
        from public.curriculum_lessons l
        where m.lesson_id=l.id and l.week_id=p_id and m.archived_at is null;
    end if;
  else
    select l.week_id into target_week
      from public.curriculum_lessons l
      join public.curriculum_weeks w on w.id=l.week_id
      where l.id=p_id and w.course_id=p_course
      for update of l,w;
    if target_week is null then raise exception 'CURRICULUM_NOT_FOUND'; end if;
    if not p_archived and exists(select 1 from public.curriculum_weeks where id=target_week and archived_at is not null) then
      raise exception 'CURRICULUM_PARENT_ARCHIVED';
    end if;

    update public.curriculum_lessons
      set archived_at=case when p_archived then now() else null end,
          is_published=false
      where id=p_id and week_id=target_week;
    get diagnostics affected=row_count;
    update public.curriculum_missions
      set archived_at=case when p_archived then now() else null end,
          is_published=false,
          archived_by_curriculum=p_archived
      where lesson_id=p_id and ((p_archived and archived_at is null) or (not p_archived and archived_by_curriculum));
  end if;

  if affected<>1 then raise exception 'CURRICULUM_NOT_FOUND'; end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
    values(p_actor,
      case when p_archived then 'curriculum.item_archived' else 'curriculum.item_restored' end,
      case when p_kind='week' then 'curriculum_week' else 'curriculum_lesson' end,
      p_id::text,
      jsonb_build_object('course_id',p_course,'kind',p_kind,'archived',p_archived,'affected',affected));
  return jsonb_build_object('id',p_id,'kind',p_kind,'archived',p_archived,'affected',affected);
end;
$$;

revoke all on function public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.edu_set_curriculum_archive(uuid,uuid,text,uuid,boolean) to service_role;

commit;
