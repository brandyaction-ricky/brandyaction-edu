-- Additive only. Old clients may omit both columns; all existing RLS/grants remain.
-- Deploy before the supporting intake code. No production/DEV execution implied.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
alter table public.edu_campus_support_requests
 add column tool_kind text not null default 'unspecified',
 add column tool_name text not null default '',
 add constraint campus_support_tool_kind check(tool_kind in('unspecified','ai','website','design','advertising','analytics','automation','other')),
 add constraint campus_support_tool_name check(
   length(tool_name)<=80 and tool_name !~ '[[:cntrl:]]'
   and ((tool_kind='unspecified' and tool_name='') or (tool_kind<>'unspecified' and length(btrim(tool_name))>=1))
 );
comment on column public.edu_campus_support_requests.tool_kind is 'Optional learner-selected tool category. Existing requests remain unspecified; do not infer from question text.';
comment on column public.edu_campus_support_requests.tool_name is 'Learner-selected tool name, bounded to 80 characters. Owner/staff visibility follows the support request policy.';
commit;
