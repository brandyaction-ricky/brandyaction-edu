begin;
create index member_groups_created_by_idx on public.member_groups(created_by);
commit;
