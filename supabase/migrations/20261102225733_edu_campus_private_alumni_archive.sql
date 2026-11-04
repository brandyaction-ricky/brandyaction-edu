-- A separate owner-only personal archive. Existing learning/business/community RLS is unchanged.
begin;
create function public.edu_campus_archive_available(eid uuid,uid uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select (current_user='service_role' or uid=(select auth.uid())) and exists(
 select 1 from public.enrollments e join public.profiles p on p.id=e.user_id and p.status='active'
 join public.cohorts h on h.id=e.cohort_id and h.course_id=e.course_id
 where e.id=eid and e.user_id=uid and e.status in ('active','expired') and e.revoked_at is null
 and (e.access_starts_at is null or e.access_starts_at<=now()) and h.status<>'cancelled'
 and (e.status='expired' or e.access_ends_at<=now() or h.status='completed'));
$$;
revoke all on function public.edu_campus_archive_available(uuid,uuid) from public,anon;
grant execute on function public.edu_campus_archive_available(uuid,uuid) to authenticated,service_role;
create table public.edu_campus_archive_entries(
 id uuid primary key,user_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 kind text not null check(kind in ('plan','recipe','artifact','note')),
 title text not null check(char_length(btrim(title)) between 1 and 120),
 body text not null check(char_length(btrim(body)) between 1 and 40000),url text not null default '' check(char_length(url)<=500 and (url='' or url ~ '^https?://[^[:space:]@]+[.][^[:space:]]+')),
 source_kind text check(source_kind in ('business','post')),source_id uuid,source_revision integer,source_snapshot jsonb,
 revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((source_kind is null and source_id is null and source_revision is null and source_snapshot is null) or (source_kind is not null and source_id is not null and source_revision>0 and source_snapshot is not null)),
 unique(user_id,enrollment_id,source_kind,source_id)
);
create index edu_campus_archive_entries_owner on public.edu_campus_archive_entries(user_id,enrollment_id,id);
create index edu_campus_archive_entries_enrollment on public.edu_campus_archive_entries(enrollment_id);
create table public.edu_campus_archive_commands(
 request_id uuid primary key,actor_id uuid not null references public.profiles(id) on delete cascade,
 entry_id uuid not null references public.edu_campus_archive_entries(id) on delete cascade,
 command_hash text not null,created_at timestamptz not null default now()
);
create index edu_campus_archive_commands_entry on public.edu_campus_archive_commands(entry_id);
create index edu_campus_archive_commands_actor on public.edu_campus_archive_commands(actor_id);
alter table public.edu_campus_archive_entries enable row level security;
alter table public.edu_campus_archive_commands enable row level security;
revoke all on public.edu_campus_archive_entries,public.edu_campus_archive_commands from public,anon,authenticated,service_role;
grant select on public.edu_campus_archive_entries to authenticated;
grant select,insert,update on public.edu_campus_archive_entries to service_role;
grant select,insert on public.edu_campus_archive_commands to service_role;
-- Only server commands can create these rows after eligibility checks. Reading an existing
-- personal copy is independent of course/cohort publication RLS, while refunds/revocation
-- and inactive accounts still remove archive access.
create policy campus_archive_owner on public.edu_campus_archive_entries for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active') and exists(select 1 from public.enrollments e where e.id=enrollment_id and e.user_id=(select auth.uid()) and e.status in ('active','expired') and e.revoked_at is null));
grant select on public.edu_campus_posts,public.edu_campus_business_records to service_role;
create function public.edu_campus_archive_read(p_actor uuid,p_enrollment uuid,p_collection text,p_cursor uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rows jsonb; next_id uuid;
begin
 if not exists(select 1 from public.profiles where id=p_actor and status='active') then raise exception 'Actor unavailable' using errcode='42501'; end if;
 if p_collection='scopes' then
  select coalesce(jsonb_agg(v order by v->>'id'),'[]') into rows from(
   select jsonb_build_object('id',e.id,'courseTitle',c.title,'cohortName',h.name,'reason',case when h.status='completed' then '기수 일정 완료' else '수강 기간 만료' end) v
   from public.enrollments e join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id
   where e.user_id=p_actor and public.edu_campus_archive_available(e.id,p_actor)) q;
  return jsonb_build_object('items',rows,'nextCursor',null);
 end if;
 if not public.edu_campus_archive_available(p_enrollment,p_actor) then raise exception 'Archive unavailable' using errcode='42501'; end if;
 if p_collection='business' then
  select coalesce(jsonb_agg(v order by v->>'id'),'[]') into rows from(select jsonb_build_object('id',r.id,'kind',r.kind,'title',r.title,'payload',r.payload,'revision',r.revision,'updatedAt',r.updated_at,'archived',r.archived_at is not null) v from public.edu_campus_business_records r where r.user_id=p_actor and r.enrollment_id=p_enrollment and (p_cursor is null or r.id>p_cursor) order by r.id limit 101) q;
 elsif p_collection='posts' then
  select coalesce(jsonb_agg(v order by v->>'id'),'[]') into rows from(select jsonb_build_object('id',p.id,'kind',p.kind,'title',p.title,'body',p.body,'url',p.url,'revision',p.revision,'updatedAt',p.updated_at) v from public.edu_campus_posts p where p.owner_id=p_actor and p.enrollment_id=p_enrollment and (p_cursor is null or p.id>p_cursor) order by p.id limit 101) q;
 elsif p_collection='entries' then
  select coalesce(jsonb_agg(v order by v->>'id'),'[]') into rows from(select to_jsonb(e)-'user_id'-'source_snapshot' v from public.edu_campus_archive_entries e where e.user_id=p_actor and e.enrollment_id=p_enrollment and (p_cursor is null or e.id>p_cursor) order by e.id limit 101) q;
 else raise exception 'Invalid collection' using errcode='23514';
 end if;
 if jsonb_array_length(rows)>100 then next_id:=(rows->99->>'id')::uuid;rows:=rows-100;end if;
 return jsonb_build_object('items',rows,'nextCursor',next_id);
end;
$$;
revoke all on function public.edu_campus_archive_read(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_campus_archive_read(uuid,uuid,text,uuid) to service_role;
create function public.edu_campus_archive_write(p_actor uuid,p_command jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
<<archive_cmd>>
declare eid uuid;rid uuid;cid uuid;action text;entry public.edu_campus_archive_entries;receipt public.edu_campus_archive_commands;source jsonb;source_type text;source_id uuid;source_rev integer;kind text;title text;body text;url text;hash text;
begin
 if jsonb_typeof(p_command) is distinct from 'object' or pg_column_size(p_command)>70000 then raise exception 'Invalid archive command' using errcode='23514';end if;
 eid:=(p_command->>'enrollmentId')::uuid;rid:=(p_command->>'requestId')::uuid;cid:=(p_command->>'id')::uuid;action:=p_command->>'action';hash:=md5(p_command::text);
 if eid is null or rid is null or cid is null or action is null or action not in ('create','copy','update') then raise exception 'Invalid archive command' using errcode='23514';end if;
 if not public.edu_campus_archive_available(eid,p_actor) then raise exception 'Archive unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||eid::text,25025));
 select * into receipt from public.edu_campus_archive_commands where request_id=rid;
 if receipt.request_id is not null then
  if receipt.actor_id<>p_actor or receipt.command_hash<>hash then raise exception 'Request conflict' using errcode='23505';end if;
  select * into entry from public.edu_campus_archive_entries where id=receipt.entry_id and user_id=p_actor and enrollment_id=eid;
  return to_jsonb(entry)-'user_id'-'source_snapshot';
 end if;
 if action='copy' then
  source_type:=p_command->>'sourceKind';source_id:=(p_command->>'sourceId')::uuid;source_rev:=(p_command->>'sourceRevision')::integer;
  if source_id is null or source_rev is null or source_rev<1 then raise exception 'Invalid source' using errcode='23514';end if;
  if source_type='business' then
   select jsonb_build_object('title',r.title,'kind',r.kind,'payload',r.payload,'revision',r.revision) into source from public.edu_campus_business_records r where r.id=source_id and r.user_id=p_actor and r.enrollment_id=eid;
   title:=source->>'title';body:=jsonb_pretty(source->'payload');url:='';kind:=case when source->>'kind'='recipe' then 'recipe' when source->>'kind' in ('routine','campaign','brief') then 'plan' else 'note' end;
  elsif source_type='post' then
   select jsonb_build_object('title',p.title,'body',p.body,'url',p.url,'revision',p.revision) into source from public.edu_campus_posts p where p.id=source_id and p.owner_id=p_actor and p.enrollment_id=eid;
   title:=source->>'title';body:=source->>'body';url:=source->>'url';kind:='artifact';
  else raise exception 'Invalid source type' using errcode='23514';end if;
  if source is null then raise exception 'Own source required' using errcode='42501';end if;
  if (source->>'revision')::integer<>source_rev then raise exception 'Source changed' using errcode='40001';end if;
  select a.* into entry from public.edu_campus_archive_entries a where a.user_id=p_actor and a.enrollment_id=eid and a.source_kind=source_type and a.source_id=archive_cmd.source_id;
  if entry.id is null then
   insert into public.edu_campus_archive_entries(id,user_id,enrollment_id,kind,title,body,url,source_kind,source_id,source_revision,source_snapshot) values(cid,p_actor,eid,kind,title,body,url,source_type,source_id,source_rev,source) returning * into entry;
  end if;
 else
  kind:=p_command->>'kind';title:=btrim(p_command->>'title');body:=btrim(p_command->>'body');url:=coalesce(btrim(p_command->>'url'),'');
  if action='create' then
   insert into public.edu_campus_archive_entries(id,user_id,enrollment_id,kind,title,body,url) values(cid,p_actor,eid,kind,title,body,url) returning * into entry;
  else
   select * into entry from public.edu_campus_archive_entries where id=cid and user_id=p_actor and enrollment_id=eid for update;
   if entry.id is null then raise exception 'Entry unavailable' using errcode='P0002';end if;
   if entry.revision is distinct from (p_command->>'expectedRevision')::integer then raise exception 'Entry changed' using errcode='40001';end if;
   update public.edu_campus_archive_entries set kind=archive_cmd.kind,title=archive_cmd.title,body=archive_cmd.body,url=archive_cmd.url,revision=revision+1,updated_at=now() where id=entry.id returning * into entry;
  end if;
 end if;
 insert into public.edu_campus_archive_commands(request_id,actor_id,entry_id,command_hash) values(rid,p_actor,entry.id,hash);
 return to_jsonb(entry)-'user_id'-'source_snapshot';
end;
$$;
revoke all on function public.edu_campus_archive_write(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edu_campus_archive_write(uuid,jsonb) to service_role;
comment on table public.edu_campus_archive_entries is 'Personal continuation workspace for active accounts after natural course expiry/completion. No additional lesson, AI, peer, file, space or payment access. Original owner-authored sources stay unchanged.';
commit;
