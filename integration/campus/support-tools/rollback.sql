-- Optional schema rollback, only after returning application code to the previous SHA.
-- Prefer retaining the additive columns: old application code ignores them safely.
-- Never discard learner-selected tool evidence; if any exists, this stops unchanged.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
lock table public.edu_campus_support_requests in access exclusive mode;
do $$
begin
 if exists(select 1 from public.edu_campus_support_requests where tool_kind<>'unspecified' or tool_name<>'') then
  raise exception 'Preserve support tool evidence; keep additive columns and review rollback';
 end if;
end;$$;
alter table public.edu_campus_support_requests
 drop constraint campus_support_tool_kind,
 drop constraint campus_support_tool_name,
 drop column tool_kind,
 drop column tool_name;
commit;
