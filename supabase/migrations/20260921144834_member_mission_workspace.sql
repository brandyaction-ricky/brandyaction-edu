begin;

alter table public.curriculum_missions add column form_schema jsonb not null default '{}'::jsonb
  check (jsonb_typeof(form_schema) = 'object');
alter table public.edu_mission_drafts add column response jsonb not null default '{}'::jsonb
  check (jsonb_typeof(response) = 'object');

-- Existing RLS and role grants stay in effect; no additional public access.
-- Serialize the submission with changes to the mission and retain its exact form.
create function public.guard_mission_form_submission()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare m public.curriculum_missions; q jsonb; c jsonb; answer text;
begin
  if tg_op = 'UPDATE' then
    if new.response is distinct from old.response then raise exception '이미 제출한 답변은 변경할 수 없습니다.'; end if;
    return new;
  end if;
  select * into m from public.curriculum_missions where id = new.mission_id for share;
  if not m.is_published then raise exception '현재 공개된 미션이 아닙니다.'; end if;
  if m.form_schema <> '{}'::jsonb then
    if new.response->'form_snapshot' is distinct from m.form_schema
      or new.response->'mission_snapshot' is distinct from jsonb_build_object('title',m.title,'instructions',m.instructions,'submission_type',m.submission_type) then
      raise exception '미션 구성이 변경되었습니다. 작성 내용을 보관한 뒤 새로고침해 주세요.';
    end if;
    if jsonb_typeof(new.response->'form_answers') is distinct from 'object'
      or jsonb_typeof(new.response->'checklist') is distinct from 'array' then
      raise exception '질문별 답변과 체크 항목이 필요합니다.';
    end if;
    for q in select value from jsonb_array_elements(m.form_schema->'questions') loop
      if jsonb_typeof(new.response->'form_answers'->(q->>'id')) is distinct from 'string' then raise exception '답변은 텍스트여야 합니다.'; end if;
      answer := coalesce(new.response->'form_answers'->>(q->>'id'), '');
      if (q->>'required')::boolean and length(btrim(answer)) = 0 then raise exception '필수 질문에 답해주세요.'; end if;
      if length(answer) > 5000 then raise exception '답변 길이를 확인해 주세요.'; end if;
    end loop;
    for c in select value from jsonb_array_elements(m.form_schema->'checklist') loop
      if (c->>'required')::boolean and not (new.response->'checklist' ? (c->>'id')) then raise exception '필수 체크 항목을 확인해 주세요.'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_mission_form_submission() from public, anon, authenticated;
create trigger mission_form_submission_guard before insert or update of response on public.mission_submissions
  for each row execute function public.guard_mission_form_submission();

commit;
