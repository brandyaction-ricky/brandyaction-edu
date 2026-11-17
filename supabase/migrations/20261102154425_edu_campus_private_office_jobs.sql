begin;
create schema if not exists private;
create table public.edu_campus_office_jobs (
 id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 objective text not null check(length(objective) between 10 and 2000), material_urls text[] not null default '{}',
 output_type text not null check(output_type in ('plan','copy','checklist','analysis')),
 status text not null default 'awaiting_connection' check(status in ('awaiting_connection','queued','running','review','approved','revision_requested','failed','archived')),
 revision integer not null default 1 check(revision>0), draft_text text not null default '' check(length(draft_text)<=10000), draft_url text not null default '',
 review_note text not null default '' check(length(review_note)<=2000), error_note text not null default '' check(length(error_note)<=1000),
 connector_id text, created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index campus_office_owner_recent on public.edu_campus_office_jobs(owner_id,enrollment_id,updated_at desc);
create table public.edu_campus_office_history (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.edu_campus_office_jobs(id) on delete cascade,
 revision integer not null,actor_type text not null check(actor_type in ('learner','connector')), action text not null,status text not null,
 note text not null default '',draft_text text not null default '',created_at timestamptz not null default now(),unique(job_id,revision)
);
-- Never stores secrets. A future operator must map a trusted connector to each account explicitly.
create table private.edu_campus_office_connectors (
 connector_id text not null check(connector_id ~ '^[a-z0-9_-]{1,40}$'),owner_id uuid not null references public.profiles(id) on delete cascade,
 key_version text not null,enabled boolean not null default false,created_at timestamptz not null default now(),primary key(connector_id,owner_id)
);
create table private.edu_campus_office_receipts (
 actor_id uuid not null references public.profiles(id) on delete cascade, request_id uuid not null,command jsonb not null,result jsonb not null,
 primary key(actor_id,request_id),created_at timestamptz not null default now()
);
create table private.edu_campus_office_events (
 connector_id text not null,event_id uuid not null,job_id uuid not null references public.edu_campus_office_jobs(id) on delete cascade,
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),result jsonb not null,created_at timestamptz not null default now(),primary key(connector_id,event_id)
);
create function private.campus_office_scope(p_enrollment uuid,p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id join public.courses c on c.id=e.course_id
 join public.cohorts h on h.id=e.cohort_id and h.course_id=c.id where e.id=p_enrollment and e.user_id=p_owner and (p_owner=(select auth.uid()) or current_setting('role',true)='service_role') and p.status='active'
 and e.status='active' and e.revoked_at is null and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now())
 and c.status='published' and c.archived_at is null and h.archived_at is null);
$$;
alter table public.edu_campus_office_jobs enable row level security;
alter table public.edu_campus_office_history enable row level security;
alter table private.edu_campus_office_connectors enable row level security;
alter table private.edu_campus_office_receipts enable row level security;
alter table private.edu_campus_office_events enable row level security;
revoke all on public.edu_campus_office_jobs,public.edu_campus_office_history from public,anon,authenticated;
revoke all on private.edu_campus_office_connectors,private.edu_campus_office_receipts,private.edu_campus_office_events from public,anon,authenticated;
grant select on public.edu_campus_office_jobs,public.edu_campus_office_history to authenticated;
create policy campus_office_jobs_read on public.edu_campus_office_jobs for select to authenticated using(owner_id=(select auth.uid()) and private.campus_office_scope(enrollment_id,owner_id));
create policy campus_office_history_read on public.edu_campus_office_history for select to authenticated using(exists(select 1 from public.edu_campus_office_jobs j where j.id=job_id and j.owner_id=(select auth.uid()) and private.campus_office_scope(j.enrollment_id,j.owner_id)));
create function private.campus_office_connection(p_enrollment uuid) returns text language sql stable security definer set search_path='' as $$
 select case when private.campus_office_scope(p_enrollment,(select auth.uid())) and exists(select 1 from private.edu_campus_office_connectors where owner_id=(select auth.uid()) and enabled) then 'incoming_adapter_registered' else 'not_connected' end;
$$;
create function public.edu_campus_office_connection(p_enrollment uuid) returns text language sql security invoker set search_path='' as $$ select private.campus_office_connection(p_enrollment); $$;
create function private.campus_office_mutate(c jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid:=(select auth.uid()); request_id uuid:=(c->>'requestId')::uuid; enrollment uuid:=(c->>'enrollmentId')::uuid; act text:=c->>'action'; j public.edu_campus_office_jobs; prev private.edu_campus_office_receipts; result jsonb; next_status text; urls text[]; u text;
begin
 if actor is null or request_id is null or not private.campus_office_scope(enrollment,actor) or octet_length(c::text)>24000 then raise exception 'scope' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request_id::text,1));
 select * into prev from private.edu_campus_office_receipts r where r.actor_id=actor and r.request_id=request_id;
 if prev.request_id is not null then if prev.command<>c then raise exception 'receipt conflict' using errcode='40001'; end if; return prev.result; end if;
 if act='create' then
   -- The rate limit is per owner, so creations in different enrollments share one lock.
   perform pg_advisory_xact_lock(hashtextextended(actor::text,3));
   if (select count(*) from public.edu_campus_office_jobs where owner_id=actor and enrollment_id=enrollment and status<>'archived')>=50 or (select count(*) from public.edu_campus_office_jobs where owner_id=actor and created_at>now()-interval '1 minute')>=10 then raise exception 'request limit' using errcode='40001'; end if;
   if length(btrim(c->>'objective')) not between 10 and 2000 or c->>'outputType' not in ('plan','copy','checklist','analysis') or jsonb_typeof(c->'materialUrls') is distinct from 'array' or jsonb_array_length(c->'materialUrls')>5 then raise exception 'input' using errcode='23514'; end if;
   select coalesce(array_agg(value),'{}') into urls from jsonb_array_elements_text(c->'materialUrls');
   foreach u in array urls loop if u='' or not private.campus_community_url(u) then raise exception 'url' using errcode='23514'; end if; end loop;
   insert into public.edu_campus_office_jobs(id,owner_id,enrollment_id,objective,material_urls,output_type) values(request_id,actor,enrollment,btrim(c->>'objective'),urls,c->>'outputType') returning * into j;
 else
   select * into j from public.edu_campus_office_jobs where id=(c->>'jobId')::uuid and owner_id=actor and enrollment_id=enrollment for update;
   if j.id is null then raise exception 'scope' using errcode='42501'; end if;
   if j.revision is distinct from (c->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001'; end if;
   if length(coalesce(c->>'note',''))>2000 or (act in ('approve','request_revision') and coalesce(length(btrim(c->>'note')),0)<5) then raise exception 'note' using errcode='23514'; end if;
   next_status:=case when act='approve' and j.status='review' and length(j.draft_text)>=10 then 'approved'
     when act='request_revision' and j.status='review' then 'revision_requested'
     when act='retry' and j.status='failed' then 'awaiting_connection'
     when act='archive' and j.status in ('awaiting_connection','review','approved','revision_requested','failed') then 'archived' else null end;
   if next_status is null then raise exception 'transition' using errcode='40001'; end if;
   update public.edu_campus_office_jobs set status=next_status,revision=revision+1,review_note=coalesce(btrim(c->>'note'),''),error_note=case when act='retry' then '' else error_note end,updated_at=now() where id=j.id returning * into j;
 end if;
 insert into public.edu_campus_office_history(job_id,revision,actor_type,action,status,note) values(j.id,j.revision,'learner',act,j.status,coalesce(btrim(c->>'note'),''));
 result:=jsonb_build_object('jobId',j.id,'revision',j.revision,'status',j.status);
 insert into private.edu_campus_office_receipts(actor_id,request_id,command,result) values(actor,request_id,c,result);
 return result;
end;
$$;
create function public.edu_campus_office_mutate(p_command jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.campus_office_mutate(p_command); $$;
-- Only the server after HMAC verification can call ingestion; authenticated users cannot spoof bot events.
create function private.campus_office_ingest(p_connector text,p_key_version text,p_allowed_owners uuid[],p_event_id uuid,p_payload_hash text,p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.edu_campus_office_jobs; prev private.edu_campus_office_events; result jsonb; next_status text; act text:=p_event->>'event';
begin
 if p_connector is null or p_event_id is null or p_payload_hash !~ '^[a-f0-9]{64}$' or octet_length(p_event::text)>48000 then raise exception 'invalid event' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_connector||p_event_id::text,2));
 select * into j from public.edu_campus_office_jobs where id=(p_event->>'jobId')::uuid for update;
 if j.id is null or (j.owner_id=any(coalesce(p_allowed_owners,'{}'::uuid[]))) is not true or not private.campus_office_scope(j.enrollment_id,j.owner_id) or not exists(select 1 from private.edu_campus_office_connectors r where r.connector_id=p_connector and r.owner_id=j.owner_id and r.key_version=p_key_version and r.enabled) then raise exception 'connector scope' using errcode='42501'; end if;
 if j.connector_id is not null and j.connector_id<>p_connector then raise exception 'connector mismatch' using errcode='42501'; end if;
 select * into prev from private.edu_campus_office_events r where r.connector_id=p_connector and r.event_id=p_event_id;
 if prev.event_id is not null then if prev.payload_hash<>p_payload_hash or prev.job_id<>j.id then raise exception 'replay conflict' using errcode='40001'; end if; return prev.result; end if;
 if j.revision is distinct from (p_event->>'expectedRevision')::integer then raise exception 'revision conflict' using errcode='40001'; end if;
 next_status:=case when act='accepted' and j.status in ('awaiting_connection','revision_requested') then 'queued'
 when act='started' and j.status='queued' then 'running'
 when act='draft' and j.status='running' then 'review'
 when act='failed' and j.status in ('queued','running') then 'failed' else null end;
 if next_status is null then raise exception 'transition' using errcode='40001'; end if;
 if length(coalesce(p_event->>'note',''))>1000 or (act='failed' and coalesce(length(btrim(p_event->>'note')),0)<5) then raise exception 'event note' using errcode='23514'; end if;
 if act='draft' and (coalesce(length(btrim(p_event->>'draftText')),0) not between 10 and 10000 or not private.campus_community_url(coalesce(p_event->>'draftUrl',''))) then raise exception 'draft' using errcode='23514'; end if;
 update public.edu_campus_office_jobs set status=next_status,connector_id=p_connector,revision=revision+1,
 draft_text=case when act='draft' then btrim(p_event->>'draftText') else draft_text end,
 draft_url=case when act='draft' then coalesce(p_event->>'draftUrl','') else draft_url end,
 error_note=case when act='failed' then btrim(p_event->>'note') else '' end,updated_at=now() where id=j.id returning * into j;
 insert into public.edu_campus_office_history(job_id,revision,actor_type,action,status,note,draft_text) values(j.id,j.revision,'connector',act,j.status,coalesce(btrim(p_event->>'note'),''),case when act='draft' then j.draft_text else '' end);
 result:=jsonb_build_object('jobId',j.id,'revision',j.revision,'status',j.status);
 insert into private.edu_campus_office_events(connector_id,event_id,job_id,payload_hash,result) values(p_connector,p_event_id,j.id,p_payload_hash,result);
 return result;
end;
$$;
create function public.edu_campus_office_ingest(p_connector text,p_key_version text,p_allowed_owners uuid[],p_event_id uuid,p_payload_hash text,p_event jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.campus_office_ingest(p_connector,p_key_version,p_allowed_owners,p_event_id,p_payload_hash,p_event); $$;
revoke all on function private.campus_office_ingest(text,text,uuid[],uuid,text,jsonb) from public,anon,authenticated;
revoke all on function private.campus_office_scope(uuid,uuid),private.campus_office_connection(uuid),private.campus_office_mutate(jsonb),public.edu_campus_office_connection(uuid),public.edu_campus_office_mutate(jsonb),public.edu_campus_office_ingest(text,text,uuid[],uuid,text,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
grant execute on function private.campus_office_scope(uuid,uuid),private.campus_office_connection(uuid),private.campus_office_mutate(jsonb),public.edu_campus_office_connection(uuid),public.edu_campus_office_mutate(jsonb) to authenticated;
grant execute on function private.campus_office_ingest(text,text,uuid[],uuid,text,jsonb),public.edu_campus_office_ingest(text,text,uuid[],uuid,text,jsonb) to service_role;
comment on table public.edu_campus_office_jobs is 'Private learner AI-office inbox. Creation never dispatches work. Running/review requires a signed mapped connector event; approved requires the owner review.';
commit;
