-- Optional presentation data travels with the immutable lesson document.
-- Existing versions/answers remain unchanged; no backfill or global settings.
begin;
alter table public.edu_lesson_block_versions add constraint edu_lesson_presentation_valid check (
  not (document ? 'presentation') or (
    jsonb_typeof(document->'presentation') = 'object'
    and (document->'presentation') ?& array['tag','tagLabel']
    and ((document->'presentation') - array['tag','tagLabel']) = '{}'::jsonb
    and jsonb_typeof(document->'presentation'->'tag') = 'string'
    and jsonb_typeof(document->'presentation'->'tagLabel') = 'string'
    and length(document->'presentation'->>'tag') <= 100
    and length(document->'presentation'->>'tagLabel') <= 100
  )
);

-- Only the display label is projected into the published lesson list. The
-- actor/access checks and opening rules are identical to the existing RPC.
create or replace function public.edu_read_lesson_progression(p_actor uuid,p_enrollment uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare course uuid;
begin
  select e.course_id into course from public.enrollments e join public.profiles p on p.id=e.user_id where e.id=p_enrollment and e.user_id=p_actor
    and p.status='active' and e.status='active' and e.revoked_at is null and e.access_starts_at<=now() and (e.access_ends_at is null or e.access_ends_at>now());
  if course is null then raise exception 'BLOCK_FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(public.edu_lesson_progression_gate(p_enrollment,l.id)
    || jsonb_build_object('tagLabel',coalesce(v.document->'presentation'->>'tagLabel','')) order by l.id)
    from public.curriculum_lessons l join public.curriculum_weeks w on w.id=l.week_id
    left join public.edu_lesson_block_heads h on h.lesson_id=l.id
    left join public.edu_lesson_block_versions v on v.id=h.revision
    where w.course_id=course and l.archived_at is null and w.archived_at is null and l.is_published and w.is_published),'[]'::jsonb);
end;
$$;
revoke all on function public.edu_read_lesson_progression(uuid,uuid) from public,anon,authenticated;
grant execute on function public.edu_read_lesson_progression(uuid,uuid) to service_role;
commit;
