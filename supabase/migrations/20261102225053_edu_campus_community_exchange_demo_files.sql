begin;
create table public.edu_campus_exchanges (
 id uuid primary key, post_id uuid not null references public.edu_campus_posts(id), cohort_id uuid not null references public.cohorts(id),
 proposer_id uuid not null references public.profiles(id), recipient_id uuid not null references public.profiles(id),
 alias text not null check(length(alias) between 2 and 24), proposal text not null check(length(proposal) between 10 and 2000),
 status text not null default 'proposed' check(status in ('proposed','accepted','declined','submitted','completed','canceled')),
 result_note text not null default '', revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(proposer_id<>recipient_id)
);
create unique index campus_exchange_open_pair on public.edu_campus_exchanges(post_id,proposer_id) where status in ('proposed','accepted','submitted');
create index campus_exchange_post on public.edu_campus_exchanges(post_id,created_at);
create table public.edu_campus_demo_slots (
 id uuid primary key,post_id uuid not null references public.edu_campus_posts(id),cohort_id uuid not null references public.cohorts(id),
 presenter_id uuid not null references public.profiles(id),starts_at timestamptz not null,minutes integer not null check(minutes between 5 and 30),
 status text not null default 'scheduled' check(status in ('scheduled','presenting','finished','canceled')),revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index campus_demo_open_post on public.edu_campus_demo_slots(post_id) where status in ('scheduled','presenting');
create unique index campus_demo_one_presenting on public.edu_campus_demo_slots(cohort_id) where status='presenting';
create index campus_demo_schedule on public.edu_campus_demo_slots(cohort_id,starts_at);
create table public.edu_campus_demo_questions (
 id uuid primary key,slot_id uuid not null references public.edu_campus_demo_slots(id),author_id uuid not null references public.profiles(id),
 alias text not null check(length(alias) between 2 and 24),body text not null check(length(body) between 5 and 2000),
 answer text not null default '',revision integer not null default 1,created_at timestamptz not null default now(),answered_at timestamptz
);
create index campus_demo_questions_slot on public.edu_campus_demo_questions(slot_id,created_at);
create table public.edu_campus_community_flow_history (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.edu_campus_posts(id),entity_id uuid not null,
 kind text not null check(kind in ('exchange','demo')),actor_id uuid not null references public.profiles(id),action text not null,
 status text not null,note text not null,revision integer not null,created_at timestamptz not null default now()
);
create index campus_flow_history_post on public.edu_campus_community_flow_history(post_id,created_at);
create table private.edu_campus_community_flow_receipts(actor_id uuid not null,request_id uuid not null,command jsonb not null,result jsonb not null,primary key(actor_id,request_id));
create function private.campus_exchange_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.edu_campus_exchanges e where e.id=p_id and (select auth.uid()) in (e.proposer_id,e.recipient_id)
 and private.campus_community_scope(e.cohort_id));
$$;
alter table public.edu_campus_exchanges enable row level security;
alter table public.edu_campus_demo_slots enable row level security;
alter table public.edu_campus_demo_questions enable row level security;
alter table public.edu_campus_community_flow_history enable row level security;
alter table private.edu_campus_community_flow_receipts enable row level security;
revoke all on public.edu_campus_exchanges,public.edu_campus_demo_slots,public.edu_campus_demo_questions,public.edu_campus_community_flow_history,private.edu_campus_community_flow_receipts from public,anon,authenticated;
grant select on public.edu_campus_exchanges,public.edu_campus_demo_slots,public.edu_campus_demo_questions,public.edu_campus_community_flow_history to authenticated;
create policy campus_exchange_read on public.edu_campus_exchanges for select to authenticated using(private.campus_exchange_read(id));
create policy campus_demo_read on public.edu_campus_demo_slots for select to authenticated using(private.campus_community_read_post(post_id));
create policy campus_demo_question_read on public.edu_campus_demo_questions for select to authenticated using(exists(select 1 from public.edu_campus_demo_slots s where s.id=slot_id and private.campus_community_read_post(s.post_id) and not private.campus_community_blocked(author_id,s.cohort_id)));
create policy campus_flow_history_read on public.edu_campus_community_flow_history for select to authenticated using(case when kind='exchange' then private.campus_exchange_read(entity_id) else private.campus_community_read_post(post_id) end);

create function private.campus_community_flow_mutate(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());rid uuid:=(c->>'requestId')::uuid;act text:=c->>'action';p public.edu_campus_posts;
 x public.edu_campus_exchanges;s public.edu_campus_demo_slots;q public.edu_campus_demo_questions;prev private.edu_campus_community_flow_receipts;
 result jsonb;next_status text;start_at timestamptz;duration integer;note text:=coalesce(btrim(c->>'note'),'');
begin
 if rid is null or not private.campus_community_active() or octet_length(c::text)>12000 then raise exception 'scope' using errcode='42501'; end if;
 select * into p from public.edu_campus_posts where id=(c->>'postId')::uuid;
 if p.id is null or not private.campus_community_read_post(p.id) or p.hidden or p.visibility<>'cohort' then raise exception 'scope' using errcode='42501'; end if;
 if not private.campus_community_scope(p.cohort_id) and not private.mission_has_scope('members') then raise exception 'scope' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||rid::text,10));
 select * into prev from private.edu_campus_community_flow_receipts r where r.actor_id=actor and r.request_id=rid;
 if prev.request_id is not null then if prev.command<>c then raise exception 'replay conflict' using errcode='40001'; end if;return prev.result;end if;
 if length(note)>2000 then raise exception 'note' using errcode='23514';end if;
 if act='exchange_propose' then
   if p.kind not in ('talent_offer','talent_request') or p.owner_id=actor or not private.campus_community_scope(p.cohort_id) or private.campus_community_blocked(p.owner_id,p.cohort_id) then raise exception 'scope' using errcode='42501';end if;
   if length(note)<10 or coalesce(length(btrim(c->>'alias')),0) not between 2 and 24 then raise exception 'input' using errcode='23514';end if;
   perform pg_advisory_xact_lock(hashtextextended(actor::text,11));
   if (select count(*) from public.edu_campus_exchanges where proposer_id=actor and created_at>now()-interval '1 minute')>=5 then raise exception 'limit' using errcode='40001';end if;
   insert into public.edu_campus_exchanges(id,post_id,cohort_id,proposer_id,recipient_id,alias,proposal) values(rid,p.id,p.cohort_id,actor,p.owner_id,btrim(c->>'alias'),note) returning * into x;
 elsif act like 'exchange_%' then
   select * into x from public.edu_campus_exchanges where id=(c->>'entityId')::uuid and post_id=p.id for update;
   if x.id is null or not private.campus_exchange_read(x.id) or private.campus_community_blocked(case when actor=x.proposer_id then x.recipient_id else x.proposer_id end,p.cohort_id) then raise exception 'scope' using errcode='42501';end if;
   if x.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001';end if;
   if length(note)<5 then raise exception 'note' using errcode='23514';end if;
   next_status:=case when actor=x.recipient_id and x.status='proposed' and act='exchange_accept' then 'accepted'
   when actor=x.recipient_id and x.status='proposed' and act='exchange_decline' then 'declined'
   when actor=x.proposer_id and x.status='accepted' and act='exchange_submit' then 'submitted'
   when actor=x.recipient_id and x.status='submitted' and act='exchange_complete' then 'completed'
   when actor=x.proposer_id and x.status='proposed' and act='exchange_cancel' then 'canceled' end;
   if next_status is null then raise exception 'transition' using errcode='40001';end if;
   update public.edu_campus_exchanges set status=next_status,result_note=case when act='exchange_submit' then note else result_note end,revision=revision+1,updated_at=now() where id=x.id returning * into x;
 elsif act='demo_reserve' then
   if p.kind<>'demo_day' or p.owner_id<>actor or not private.campus_community_scope(p.cohort_id) then raise exception 'scope' using errcode='42501';end if;
   start_at:=(c->>'startsAt')::timestamptz;duration:=(c->>'minutes')::integer;
   if start_at is null or start_at<now() or start_at>now()+interval '90 days' or duration is null or duration not between 5 and 30 then raise exception 'schedule' using errcode='23514';end if;
   perform pg_advisory_xact_lock(hashtextextended(p.cohort_id::text,12));
   if exists(select 1 from public.edu_campus_demo_slots where cohort_id=p.cohort_id and status in ('scheduled','presenting') and starts_at<start_at+make_interval(mins=>duration) and starts_at+make_interval(mins=>minutes)>start_at) then raise exception 'slot conflict' using errcode='40001';end if;
   insert into public.edu_campus_demo_slots(id,post_id,cohort_id,presenter_id,starts_at,minutes) values(rid,p.id,p.cohort_id,actor,start_at,duration) returning * into s;
 elsif act in ('demo_start','demo_finish','demo_cancel') then
   select * into s from public.edu_campus_demo_slots where id=(c->>'entityId')::uuid and post_id=p.id for update;
   if s.id is null or (not private.mission_has_scope('members') and not (act='demo_cancel' and s.presenter_id=actor)) then raise exception 'operator scope' using errcode='42501';end if;
   if s.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001';end if;
   if length(note)<5 then raise exception 'note' using errcode='23514';end if;
   next_status:=case when act='demo_start' and s.status='scheduled' then 'presenting' when act='demo_finish' and s.status='presenting' then 'finished' when act='demo_cancel' and s.status='scheduled' then 'canceled' end;
   if next_status is null then raise exception 'transition' using errcode='40001';end if;
   update public.edu_campus_demo_slots set status=next_status,revision=revision+1,updated_at=now() where id=s.id returning * into s;
 elsif act in ('demo_ask','demo_answer') then
   select * into s from public.edu_campus_demo_slots where id=(c->>'entityId')::uuid and post_id=p.id for share;
   if s.id is null or s.status='canceled' or not private.campus_community_scope(p.cohort_id) then raise exception 'scope' using errcode='42501';end if;
   if length(note)<5 then raise exception 'note' using errcode='23514';end if;
   if act='demo_ask' then
     if s.status not in ('scheduled','presenting') or coalesce(length(btrim(c->>'alias')),0) not between 2 and 24 then raise exception 'input' using errcode='23514';end if;
     perform pg_advisory_xact_lock(hashtextextended(actor::text,13));
     if (select count(*) from public.edu_campus_demo_questions where author_id=actor and created_at>now()-interval '1 minute')>=5 then raise exception 'limit' using errcode='40001';end if;
     insert into public.edu_campus_demo_questions(id,slot_id,author_id,alias,body) values(rid,s.id,actor,btrim(c->>'alias'),note) returning * into q;
   else
     if s.presenter_id<>actor then raise exception 'presenter scope' using errcode='42501';end if;
     select * into q from public.edu_campus_demo_questions where id=(c->>'questionId')::uuid and slot_id=s.id for update;
     if q.id is null then raise exception 'scope' using errcode='42501';end if;
     if q.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001';end if;
     update public.edu_campus_demo_questions set answer=note,answered_at=now(),revision=revision+1 where id=q.id returning * into q;
   end if;
 else raise exception 'action' using errcode='23514';end if;
 result:=jsonb_build_object('id',coalesce(x.id,q.id,s.id),'revision',coalesce(x.revision,q.revision,s.revision));
 insert into public.edu_campus_community_flow_history(post_id,entity_id,kind,actor_id,action,status,note,revision) values(p.id,coalesce(x.id,s.id),case when x.id is not null then 'exchange' else 'demo' end,actor,act,coalesce(x.status,s.status),note,coalesce(x.revision,q.revision,s.revision));
 insert into private.edu_campus_community_flow_receipts values(actor,rid,c,result);return result;
end;$$;
create function public.edu_campus_community_flow_mutate(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.campus_community_flow_mutate(p_command);$$;
create function public.edu_campus_community_operator() returns boolean language sql security invoker set search_path='' as $$select private.mission_has_scope('members');$$;
revoke all on function private.campus_exchange_read(uuid),private.campus_community_flow_mutate(jsonb),public.edu_campus_community_flow_mutate(jsonb),public.edu_campus_community_operator() from public,anon;
grant execute on function private.campus_exchange_read(uuid),private.campus_community_flow_mutate(jsonb),public.edu_campus_community_flow_mutate(jsonb),public.edu_campus_community_operator() to authenticated;

create table public.edu_campus_portfolio_files (
 id uuid primary key,owner_id uuid not null references public.profiles(id),post_id uuid not null references public.edu_campus_posts(id),
 post_revision integer not null,name text not null check(length(name) between 1 and 180),size integer not null check(size between 1 and 10485760),
 content_type text not null check(content_type in ('image/png','image/jpeg','image/webp','application/pdf')),
 path text not null unique,state text not null default 'pending' check(state in ('pending','ready')),sha256 text,created_at timestamptz not null default now(),ready_at timestamptz,
 visibility text not null default 'private' check(visibility in ('private','cohort')),revision integer not null default 1,shared_at timestamptz
);
create index campus_files_owner_post on public.edu_campus_portfolio_files(owner_id,post_id,created_at);
alter table public.edu_campus_portfolio_files enable row level security;
revoke all on public.edu_campus_portfolio_files from public,anon,authenticated;
grant select on public.edu_campus_portfolio_files to authenticated;
create function private.campus_portfolio_file_read(p_file uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.edu_campus_portfolio_files f join public.edu_campus_posts p on p.id=f.post_id where f.id=p_file and private.campus_community_scope(p.cohort_id) and
 (f.owner_id=(select auth.uid()) or (f.state='ready' and f.visibility='cohort' and p.visibility='cohort' and not p.hidden and not private.campus_community_blocked(p.owner_id,p.cohort_id) and not exists(select 1 from public.edu_campus_reports r where r.post_id=p.id and r.status='open') and exists(select 1 from public.enrollments e join public.profiles u on u.id=e.user_id where e.id=p.enrollment_id and u.status='active' and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())))));
$$;
revoke all on function private.campus_portfolio_file_read(uuid) from public,anon;grant execute on function private.campus_portfolio_file_read(uuid) to authenticated;
create policy campus_files_private_or_explicit_shared on public.edu_campus_portfolio_files for select to authenticated using(private.campus_portfolio_file_read(id));
create table public.edu_campus_portfolio_file_access_log(id uuid primary key default gen_random_uuid(),file_id uuid not null references public.edu_campus_portfolio_files(id),owner_id uuid not null references public.profiles(id),actor_id uuid,visibility text not null,revision integer not null,reason text not null,created_at timestamptz not null default now());
alter table public.edu_campus_portfolio_file_access_log enable row level security;revoke all on public.edu_campus_portfolio_file_access_log from public,anon,authenticated;grant select on public.edu_campus_portfolio_file_access_log to authenticated;
create policy campus_file_access_log_owner on public.edu_campus_portfolio_file_access_log for select to authenticated using(owner_id=(select auth.uid()) and private.campus_portfolio_file_read(file_id));
create index campus_file_access_log_file on public.edu_campus_portfolio_file_access_log(file_id,created_at);
create function private.campus_portfolio_file_share(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());f public.edu_campus_portfolio_files;p public.edu_campus_posts;prev private.edu_campus_community_flow_receipts;rid uuid:=(c->>'requestId')::uuid;v text:=c->>'visibility';result jsonb;
begin
 if rid is null or v is null or v not in ('private','cohort') then raise exception 'input' using errcode='23514';end if;
 select * into f from public.edu_campus_portfolio_files where id=(c->>'fileId')::uuid and owner_id=actor;
 if f.id is null or not private.campus_portfolio_file_read(f.id) then raise exception 'scope' using errcode='42501';end if;
 select * into p from public.edu_campus_posts where id=f.post_id for share;
 -- Same lock order as post edits + automatic share revocation: post, then file.
 select * into f from public.edu_campus_portfolio_files where id=f.id for update;
 if v='cohort' and (f.state<>'ready' or (c->>'confirmed')::boolean is distinct from true or p.visibility<>'cohort' or p.hidden or exists(select 1 from public.edu_campus_reports r where r.post_id=p.id and r.status='open')) then raise exception 'share scope' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||rid::text,10));
 select * into prev from private.edu_campus_community_flow_receipts where actor_id=actor and request_id=rid;
 if prev.request_id is not null then if prev.command<>c then raise exception 'replay conflict' using errcode='40001';end if;return prev.result;end if;
 if f.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001';end if;
 update public.edu_campus_portfolio_files set visibility=v,revision=revision+1,shared_at=case when v='cohort' then now() else null end where id=f.id returning * into f;
 insert into public.edu_campus_portfolio_file_access_log(file_id,owner_id,actor_id,visibility,revision,reason) values(f.id,actor,actor,v,f.revision,'owner_explicit_choice');
 result:=jsonb_build_object('id',f.id,'visibility',f.visibility,'revision',f.revision);insert into private.edu_campus_community_flow_receipts values(actor,rid,c,result);return result;
end;$$;
create function public.edu_campus_portfolio_file_share(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.campus_portfolio_file_share(p_command);$$;
revoke all on function private.campus_portfolio_file_share(jsonb),public.edu_campus_portfolio_file_share(jsonb) from public,anon;grant execute on function private.campus_portfolio_file_share(jsonb),public.edu_campus_portfolio_file_share(jsonb) to authenticated;
create function private.campus_portfolio_revoke_share() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.edu_campus_portfolio_files;
begin
 if (old.visibility='cohort' and new.visibility='private') or (not old.hidden and new.hidden) then
  for f in update public.edu_campus_portfolio_files set visibility='private',revision=revision+1,shared_at=null where post_id=new.id and visibility='cohort' returning * loop
   insert into public.edu_campus_portfolio_file_access_log(file_id,owner_id,actor_id,visibility,revision,reason) values(f.id,f.owner_id,(select auth.uid()),'private',f.revision,'post_visibility_revoked');
  end loop;
 end if;return new;
end;$$;
revoke all on function private.campus_portfolio_revoke_share() from public,anon,authenticated;
create trigger campus_portfolio_revoke_share after update of visibility,hidden on public.edu_campus_posts for each row execute function private.campus_portfolio_revoke_share();
create function private.campus_portfolio_file_prepare(c jsonb) returns public.edu_campus_portfolio_files language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());p public.edu_campus_posts;f public.edu_campus_portfolio_files;rid uuid:=(c->>'requestId')::uuid;fname text:=c->>'name';sz integer:=(c->>'size')::integer;mime text:=c->>'contentType';
begin
 select * into p from public.edu_campus_posts where id=(c->>'postId')::uuid and owner_id=actor;
 if p.id is null or rid is null or not private.campus_community_scope(p.cohort_id) or not private.campus_community_read_post(p.id) then raise exception 'scope' using errcode='42501';end if;
 if coalesce(length(fname),0) not between 1 and 180 or fname ~ '[[:cntrl:]/\\]' or sz is null or sz not between 1 and 10485760 or mime is null or mime not in ('image/png','image/jpeg','image/webp','application/pdf') then raise exception 'file' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,14));
 select * into f from public.edu_campus_portfolio_files where id=rid;
 if f.id is not null then
   if f.owner_id<>actor or f.post_id<>p.id or f.name<>fname or f.size<>sz or f.content_type<>mime then raise exception 'replay conflict' using errcode='40001';end if;return f;
 end if;
 if p.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001';end if;
 if (select count(*) from public.edu_campus_portfolio_files where owner_id=actor and created_at>now()-interval '1 day')>=50 or (select count(*) from public.edu_campus_portfolio_files where post_id=p.id)>=20 then raise exception 'limit' using errcode='40001';end if;
 insert into public.edu_campus_portfolio_files(id,owner_id,post_id,post_revision,name,size,content_type,path) values(rid,actor,p.id,p.revision,fname,sz,mime,actor::text||'/'||p.id::text||'/'||rid::text) returning * into f;return f;
end;$$;
create function public.edu_campus_portfolio_file_prepare(p_command jsonb) returns public.edu_campus_portfolio_files language sql security invoker set search_path='' as $$select private.campus_portfolio_file_prepare(p_command);$$;
create function private.campus_portfolio_file_complete(p_actor uuid,p_file uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.edu_campus_portfolio_files;
begin
 if current_setting('role',true)<>'service_role' or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'scope' using errcode='42501';end if;
 select * into f from public.edu_campus_portfolio_files where id=p_file and owner_id=p_actor for update;
 if f.id is null or not exists(select 1 from public.edu_campus_posts p join public.enrollments e on e.id=p.enrollment_id join public.profiles u on u.id=e.user_id join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id where p.id=f.post_id and p.owner_id=p_actor and e.user_id=p_actor and u.status='active' and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()) and c.status='published' and c.archived_at is null and h.archived_at is null) then raise exception 'scope' using errcode='42501';end if;
 if f.state='ready' and f.sha256<>p_hash then raise exception 'hash conflict' using errcode='40001';end if;
 update public.edu_campus_portfolio_files set state='ready',sha256=p_hash,ready_at=coalesce(ready_at,now()) where id=f.id;
 return jsonb_build_object('id',f.id,'ready',true);
end;$$;
create function public.edu_campus_portfolio_file_complete(p_actor uuid,p_file uuid,p_hash text) returns jsonb language sql security invoker set search_path='' as $$select private.campus_portfolio_file_complete(p_actor,p_file,p_hash);$$;
revoke all on function private.campus_portfolio_file_prepare(jsonb),public.edu_campus_portfolio_file_prepare(jsonb) from public,anon;
grant execute on function private.campus_portfolio_file_prepare(jsonb),public.edu_campus_portfolio_file_prepare(jsonb) to authenticated;
revoke all on function private.campus_portfolio_file_complete(uuid,uuid,text),public.edu_campus_portfolio_file_complete(uuid,uuid,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.campus_portfolio_file_complete(uuid,uuid,text),public.edu_campus_portfolio_file_complete(uuid,uuid,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('campus-portfolio-private','campus-portfolio-private',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf']) on conflict(id) do nothing;
do $$begin
 if exists(select 1 from storage.buckets where id='campus-portfolio-private' and (public or file_size_limit is distinct from 10485760 or allowed_mime_types is distinct from array['image/png','image/jpeg','image/webp','application/pdf'])) then raise exception 'Portfolio bucket configuration differs; stop and inspect before applying';end if;
end;$$;
-- These files are served through the owner-checking API. An unrelated permissive
-- Storage policy must not accidentally make them readable or replaceable.
create policy campus_portfolio_server_read_only on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'campus-portfolio-private');
create policy campus_portfolio_server_update_only on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'campus-portfolio-private') with check(bucket_id<>'campus-portfolio-private');
create policy campus_portfolio_server_delete_only on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'campus-portfolio-private');
commit;
