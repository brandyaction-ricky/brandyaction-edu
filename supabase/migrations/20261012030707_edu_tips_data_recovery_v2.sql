begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Source capture, publication and serving have separate gates. Defaults seed no keys/subjects.
create table edu_tips_private.feed_state (
 singleton boolean primary key default true check(singleton), capture_enabled boolean not null default false,
 serving_enabled boolean not null default false, generation integer not null default 1 check(generation>0),
 last_seq bigint not null default 0 check(last_seq>=0), capture_since timestamptz not null default statement_timestamp()
);
insert into edu_tips_private.feed_state(singleton) values(true);
create function edu_tips_private.reset_capture_coverage()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.capture_enabled and not old.capture_enabled then new.capture_since:=clock_timestamp();new.generation:=old.generation+1;end if;
 return new;
end$$;
revoke all on function edu_tips_private.reset_capture_coverage() from public,anon,authenticated,service_role;
create trigger edu_tips_capture_coverage before update of capture_enabled on edu_tips_private.feed_state for each row execute function edu_tips_private.reset_capture_coverage();
create table edu_tips_private.data_keys (
 key_hash text primary key check(key_hash ~ '^[0-9a-f]{64}$'),
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 scopes text[] not null check(cardinality(scopes)>0 and scopes <@ array['edu.events.read','edu.learning.read','edu.recovery']::text[]),
 expires_at timestamptz not null, revoked_at timestamptz
);
create index edu_tips_data_key_consumer on edu_tips_private.data_keys(consumer_id);
create table edu_tips_private.data_rates (
 consumer_id uuid primary key references edu_tips_private.erasure_consumers(id), window_at timestamptz not null,
 used integer not null check(used between 1 and 30)
);
create table edu_tips_private.opaque_refs (
 subject_id uuid not null references edu_tips_private.subjects(id), kind text not null, source_key text not null,
 opaque text not null unique default rtrim(translate(encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'base64'),'+/','-_'),'='),
 primary key(subject_id,kind,source_key)
);
create table edu_tips_private.feed_facts (
 id uuid primary key default gen_random_uuid(), subject_id uuid not null references edu_tips_private.subjects(id),
 stream text not null check(stream in ('events','learning')), record_key text not null,
 revision bigint not null check(revision>0), occurred_at timestamptz not null, expires_at timestamptz not null,
 payload jsonb not null, unique(subject_id,stream,record_key)
);
create index edu_tips_fact_expiry on edu_tips_private.feed_facts(expires_at);
create table edu_tips_private.fact_versions (
 fact_id uuid not null references edu_tips_private.feed_facts(id) on delete cascade, revision bigint not null,
 subject_id uuid not null references edu_tips_private.subjects(id), expires_at timestamptz not null, payload jsonb,
 primary key(fact_id,revision)
);
create index edu_tips_version_expiry on edu_tips_private.fact_versions(expires_at);
create table edu_tips_private.feed_outbox (
 id uuid primary key default gen_random_uuid(), fact_id uuid references edu_tips_private.feed_facts(id) on delete set null,
 subject_id uuid not null references edu_tips_private.subjects(id), stream text not null,
 revision bigint not null, payload jsonb, expires_at timestamptz not null, queued_at timestamptz not null default clock_timestamp(),
 publish_seq bigint unique, published_at timestamptz
);
create index edu_tips_feed_unpublished on edu_tips_private.feed_outbox(queued_at,id) where publish_seq is null;
create index edu_tips_feed_page on edu_tips_private.feed_outbox(stream,publish_seq) where publish_seq is not null;
create table edu_tips_private.projection_subjects (
 subject_id uuid primary key references edu_tips_private.subjects(id), captured_at timestamptz not null
);
create table edu_tips_private.feed_quarantine (
 member_id uuid primary key references public.profiles(id) on delete cascade,
 recorded_at timestamptz not null default clock_timestamp(), error_code text not null check(error_code='source_inconsistent')
);
-- Exact observed usage by KST date; do not infer intervening dates from E3a first/last aggregates.
create table edu_tips_private.learning_days (
 enrollment_id uuid not null references public.enrollments(id) on delete cascade,
 date_kst date not null, item_type text not null, item_id uuid not null, observed_at timestamptz not null,
 primary key(enrollment_id,date_kst,item_type,item_id)
);
create table edu_tips_private.recoveries (
 id uuid primary key default gen_random_uuid(), consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 request_id uuid not null, reason text not null, generation integer not null, cutoff_seq bigint not null,
 cutoff_at timestamptz not null, expires_at timestamptz not null, completed_at timestamptz,
 unique(consumer_id,request_id)
);
create table edu_tips_private.data_sessions (
 consumer_id uuid primary key references edu_tips_private.erasure_consumers(id),
 recovery_id uuid not null references edu_tips_private.recoveries(id)
);
create index edu_tips_recovery_consumer on edu_tips_private.recoveries(consumer_id,expires_at);
create table edu_tips_private.recovery_rows (
 recovery_id uuid not null references edu_tips_private.recoveries(id) on delete cascade,
 stream text not null, ordinal bigint not null, subject_id uuid not null references edu_tips_private.subjects(id),
 expires_at timestamptz not null, payload jsonb, primary key(recovery_id,stream,ordinal)
);
create table edu_tips_private.data_cursors (
 cursor_hash text primary key check(cursor_hash ~ '^[0-9a-f]{64}$'), consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 stream text not null check(stream in ('events','learning')), generation integer not null,
 position bigint not null, upper_bound bigint not null check(upper_bound>=position),
 recovery_id uuid references edu_tips_private.recoveries(id), mode text not null check(mode in ('snapshot','incremental')),
 purpose text not null check(purpose in ('position','upper')), expires_at timestamptz not null,
 terminal boolean not null default false
);
create index edu_tips_data_cursor_expiry on edu_tips_private.data_cursors(expires_at);
create index edu_tips_data_cursor_consumer on edu_tips_private.data_cursors(consumer_id,recovery_id);
create function edu_tips_private.subject_allowed(p_subject uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select s.retired_at is null and p.status='active' and p.role not in ('admin','staff') and not p.is_internal and p.deleted_at is null
  and pref.analysis and pref.overseas and pref.wording_version=s.wording_version and t.is_current
  and t.approved_at<=statement_timestamp() and t.effective_at<=statement_timestamp()
  and not exists(select 1 from edu_tips_private.subjects old join edu_tips_private.erasure_outbox q on q.subject_id=old.id where old.member_id=s.member_id and q.completed_at is null)
 from edu_tips_private.subjects s join public.profiles p on p.id=s.member_id
 join public.edu_personalization_preferences pref on pref.member_id=s.member_id
 join public.edu_personalization_terms t on t.version=s.wording_version where s.id=p_subject),false)
$$;
create function edu_tips_private.opaque_ref(s uuid,k text,v text)
returns text language plpgsql security invoker set search_path='' as $$
declare o text;
begin
 insert into edu_tips_private.opaque_refs(subject_id,kind,source_key) values(s,k,v) on conflict do nothing;
 select opaque into o from edu_tips_private.opaque_refs where subject_id=s and kind=k and source_key=v;return o;
end$$;
create function edu_tips_private.put_fact(s uuid,st text,k text,at timestamptz,expiry timestamptz,p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare f edu_tips_private.feed_facts; rev bigint; body jsonb; effective_expiry timestamptz;
begin
 if expiry<=statement_timestamp() then return;end if;
 select * into f from edu_tips_private.feed_facts where subject_id=s and stream=st and record_key=k for update;
 effective_expiry:=least(expiry,coalesce(f.expires_at,expiry));
 body:=case when st='events' then jsonb_set(p,'{payload,expires_at}',to_jsonb(to_char(effective_expiry at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
 else jsonb_set(p,'{expires_at}',to_jsonb(to_char(effective_expiry at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) end;
 if f.id is not null and (case when st='events' then f.payload#-'{payload,record_revision}' else f.payload-'record_revision' end)=(case when st='events' then body#-'{payload,record_revision}' else body-'record_revision' end) then return;end if;
 rev:=coalesce(f.revision,0)+1;
 body:=case when st='events' then jsonb_set(body,'{payload,record_revision}',to_jsonb(rev)) else jsonb_set(body,'{record_revision}',to_jsonb(rev)) end;
 insert into edu_tips_private.feed_facts(subject_id,stream,record_key,revision,occurred_at,expires_at,payload)
 values(s,st,k,rev,at,effective_expiry,body) on conflict(subject_id,stream,record_key) do update
 set revision=rev,occurred_at=at,expires_at=effective_expiry,payload=body returning * into f;
 insert into edu_tips_private.fact_versions(fact_id,revision,subject_id,expires_at,payload) values(f.id,rev,s,effective_expiry,body);
 insert into edu_tips_private.feed_outbox(fact_id,subject_id,stream,revision,payload,expires_at)
 values(f.id,s,st,rev,body,least(effective_expiry,clock_timestamp()+interval '30 days'));
end$$;
-- Projection runs inside source transactions; only its committed outbox is published.
-- Ambiguous money is quarantined without turning a valid payment/refund into failure.
create function edu_tips_private.capture_member(p_member uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare s edu_tips_private.subjects; r record; item record; used_keys text[]:='{}'; k text; body jsonb; payload jsonb;
 oid text; pid text; rid text; at timestamptz; cid text; product text;
begin
 if not exists(select 1 from edu_tips_private.feed_state where capture_enabled) then return;end if;
 select * into s from edu_tips_private.subjects where member_id=p_member and retired_at is null for update;
 if not found or not edu_tips_private.subject_allowed(s.id) then return;end if;
 begin
  for r in select pay.*,o.entry_src from public.payments pay join public.edu_analytics_orders o on o.id=pay.order_id
   where o.user_id=p_member and o.status in ('paid','partially_refunded','refunded') and pay.status in ('done','partial_cancelled','cancelled') and pay.approved_amount>0 loop
   if r.approved_at is null or r.approved_at>statement_timestamp() or r.cancelled_amount>r.approved_amount
    or (select coalesce(sum(amount),0) from public.refunds where payment_id=r.id and status='done')<>r.cancelled_amount
    or (select count(*) from public.order_items where order_id=r.order_id)<>1 then raise exception 'TIPS_SOURCE_INCONSISTENT';end if;
   select c.course_code,h.cohort_code into product,cid from public.order_items oi
    join public.courses c on c.id=oi.course_id join public.cohorts h on h.id=oi.cohort_id where oi.order_id=r.order_id;
   cid:=product||':'||cid;
   if product is null or product !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' then raise exception 'TIPS_SOURCE_INCONSISTENT';end if;
   if cid !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' then cid:=null;end if;
   oid:=edu_tips_private.opaque_ref(s.id,'order',r.order_id::text);pid:=edu_tips_private.opaque_ref(s.id,'payment',r.id::text);
   k:='payment:'||r.id;used_keys:=array_append(used_keys,k);at:=r.approved_at;
   payload:=jsonb_build_object('consent_epoch',s.consent_epoch,'consent_version',s.wording_version,'record_revision',1,
    'expires_at',to_char((at+interval '8760 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'order_id',oid,'payment_id',pid,'cohort_code',cid,'amount_paid',r.approved_amount,'currency','KRW',
    'entry_src',case when r.entry_src in ('paid','organic','alumni','youtube') then r.entry_src else 'unknown' end,'attribution_def','path_cohort@1');
   body:=jsonb_build_object('tenant_id','brandyaction','brand_id','brandyaction_edu','source','server','schema_version','1.4','session_id',null,
    'customer_id',s.customer_id,'product_id',product,'event_type','payment_completed','event_id',edu_tips_private.opaque_ref(s.id,'event',k),
    'event_timestamp',to_char(date_trunc('hour',at at time zone 'UTC'),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'payload',payload);
   perform edu_tips_private.put_fact(s.id,'events',k,at,at+interval '8760 hours',body);
   for item in select * from public.refunds where payment_id=r.id and status='done' loop
    if item.completed_at is null or item.completed_at<at or item.completed_at>statement_timestamp() or item.amount<=0 then raise exception 'TIPS_SOURCE_INCONSISTENT';end if;
    k:='refund:'||item.id;used_keys:=array_append(used_keys,k);rid:=edu_tips_private.opaque_ref(s.id,'refund',item.id::text);
    payload:=payload-'amount_paid'-'entry_src';
    payload:=payload||jsonb_build_object('refund_id',rid,'amount_refunded',item.amount,'original_payment_at',
     to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'record_revision',1,
     'expires_at',to_char((item.completed_at+interval '8760 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    body:=body||jsonb_build_object('event_type','order_refunded','event_id',edu_tips_private.opaque_ref(s.id,'event',k),
     'event_timestamp',to_char(date_trunc('hour',item.completed_at at time zone 'UTC'),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),'payload',payload);
    perform edu_tips_private.put_fact(s.id,'events',k,item.completed_at,item.completed_at+interval '8760 hours',body);
   end loop;
  end loop;
  for r in select e.cohort_id,d.date_kst,c.course_code,h.cohort_code,
   count(distinct d.item_id) filter(where d.item_type='vod_complete') vod,
   count(distinct d.item_id) filter(where d.item_type='material_download') resource,
   count(distinct d.item_id) filter(where d.item_type='live_join') live,
   count(distinct d.item_id) filter(where d.item_type='replay_view') replay
   from edu_tips_private.learning_days d join public.enrollments e on e.id=d.enrollment_id
   join public.order_items oi on oi.id=e.order_item_id join public.edu_analytics_orders o on o.id=oi.order_id
   join public.courses c on c.id=e.course_id join public.cohorts h on h.id=e.cohort_id
   where e.user_id=p_member and e.source='purchase' and o.status in ('paid','partially_refunded','refunded')
    and d.date_kst>=((statement_timestamp()-interval '2160 hours') at time zone 'Asia/Seoul')::date
    and (d.date_kst::timestamp at time zone 'Asia/Seoul')>=greatest(s.created_at,(select capture_since from edu_tips_private.feed_state))
   group by e.cohort_id,d.date_kst,c.course_code,h.cohort_code loop
   k:='learning:'||r.cohort_id||':'||r.date_kst;used_keys:=array_append(used_keys,k);
   at:=r.date_kst::timestamp at time zone 'Asia/Seoul';cid:=r.course_code||':'||r.cohort_code;
   if r.course_code is null or cid is null or r.course_code !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' or cid !~ '^[a-z0-9][a-z0-9:_-]{0,79}$' then raise exception 'TIPS_SOURCE_INCONSISTENT';end if;
   body:=jsonb_build_object('record_id',edu_tips_private.opaque_ref(s.id,'row',k),'customer_id',s.customer_id,
    'consent_epoch',s.consent_epoch,'consent_version',s.wording_version,'record_revision',1,
    'expires_at',to_char((at+interval '2160 hours') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'product_id',r.course_code,'cohort_code',cid,'date_kst',r.date_kst,'vod_completed',r.vod,'resource_used',r.resource,
    'live_used',r.live,'replay_used',r.replay,'completed_items',null,'total_items',null,'curriculum_version',null,
    'availability','unknown','cohort_state','unknown','usage_ratio',null);
   perform edu_tips_private.put_fact(s.id,'learning',k,at,at+interval '2160 hours',body);
  end loop;
  -- Removing/reclassifying a previously sent record requires a full consumer rebuild.
  if exists(select 1 from edu_tips_private.feed_facts where subject_id=s.id and not record_key=any(used_keys) and expires_at>statement_timestamp()) then
   update edu_tips_private.feed_state set generation=generation+1;
  end if;
  delete from edu_tips_private.feed_facts where subject_id=s.id and (not record_key=any(used_keys) or expires_at<=statement_timestamp());
  delete from edu_tips_private.feed_quarantine where member_id=p_member;
  insert into edu_tips_private.projection_subjects values(s.id,clock_timestamp()) on conflict(subject_id) do update set captured_at=clock_timestamp();
 exception when others then
  -- No SQL text, payment payload or customer contact is recorded.
  insert into edu_tips_private.feed_quarantine(member_id,error_code) values(p_member,'source_inconsistent')
   on conflict(member_id) do update set recorded_at=clock_timestamp();
 end;
end$$;
create function edu_tips_private.capture_source()
returns trigger language plpgsql security definer set search_path='' as $$
declare m uuid; e uuid; oldrow jsonb; newrow jsonb; v jsonb;
begin
 if not exists(select 1 from edu_tips_private.feed_state where capture_enabled) then return null;end if;
 oldrow:=case when tg_op<>'INSERT' then to_jsonb(old) else null end;newrow:=case when tg_op<>'DELETE' then to_jsonb(new) else null end;
 for v in select distinct value from jsonb_array_elements(jsonb_build_array(oldrow,newrow)) where value<>'null'::jsonb loop
  if tg_table_name='subjects' then
   m:=(v->>'member_id')::uuid;
  elsif tg_table_name in ('orders','enrollments') then m:=(v->>'user_id')::uuid;
  elsif tg_table_name='order_items' then select user_id into m from public.orders where id=(v->>'order_id')::uuid;
  elsif tg_table_name='payments' then select user_id into m from public.orders where id=(v->>'order_id')::uuid;
  elsif tg_table_name='refunds' then select o.user_id into m from public.payments p join public.orders o on o.id=p.order_id where p.id=(v->>'payment_id')::uuid;
  elsif tg_table_name='learning_usage_events' then
   e:=(v->>'enrollment_id')::uuid;select user_id into m from public.enrollments where id=e;
   if tg_op<>'DELETE' and v=newrow and exists(select 1 from edu_tips_private.subjects sb where sb.member_id=m and edu_tips_private.subject_allowed(sb.id)) and (v->>'last_used_at')::timestamptz>=
    (select capture_since from edu_tips_private.feed_state) and (v->>'last_used_at')::timestamptz<=clock_timestamp() and v->>'evidence_source'=(case v->>'item_type' when 'vod_complete' then 'lesson_progress' when 'material_download' then 'signed_file_issued' when 'live_join' then 'entry_link' when 'replay_view' then 'replay_link' end) then
    insert into edu_tips_private.learning_days(enrollment_id,date_kst,item_type,item_id,observed_at)
     values(e,((v->>'last_used_at')::timestamptz at time zone 'Asia/Seoul')::date,v->>'item_type',(v->>'item_id')::uuid,(v->>'last_used_at')::timestamptz)
     on conflict do nothing;
   end if;
  end if;
  if m is not null then perform edu_tips_private.capture_member(m);end if;
 end loop;return null;
end$$;
create trigger edu_tips_capture_order_item after insert or update or delete on public.order_items for each row execute function edu_tips_private.capture_source();
create trigger edu_tips_capture_payment after insert or update or delete on public.payments for each row execute function edu_tips_private.capture_source();
create trigger edu_tips_capture_refund after insert or update or delete on public.refunds for each row execute function edu_tips_private.capture_source();
create trigger edu_tips_capture_order after update on public.orders for each row execute function edu_tips_private.capture_source();
create trigger edu_tips_capture_enrollment after insert or update or delete on public.enrollments for each row execute function edu_tips_private.capture_source();
create trigger edu_tips_capture_learning after insert or update or delete on public.learning_usage_events for each row execute function edu_tips_private.capture_source();
create trigger edu_tips_capture_subject after insert on edu_tips_private.subjects for each row execute function edu_tips_private.capture_source();
-- Retirement removes queued/retained content; published sequence metadata survives.
create function edu_tips_private.purge_retired_feed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.retired_at is not null and old.retired_at is null then
  update edu_tips_private.feed_outbox set payload=null where subject_id=new.id;
  update edu_tips_private.recovery_rows set payload=null where subject_id=new.id;
  update edu_tips_private.fact_versions set payload=null where subject_id=new.id;
  delete from edu_tips_private.feed_facts where subject_id=new.id;
  delete from edu_tips_private.feed_quarantine where member_id=old.member_id;
  delete from edu_tips_private.learning_days where enrollment_id in(select id from public.enrollments where user_id=old.member_id);
 end if;return null;
end$$;
create trigger edu_tips_purge_retired_feed after update of retired_at on edu_tips_private.subjects for each row execute function edu_tips_private.purge_retired_feed();
create function public.edu_tips_data_gate(p_key_hash text,p_environment text,p_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c uuid; granted text[]; n integer; w timestamptz:=date_trunc('minute',statement_timestamp());
begin
 if not exists(select 1 from edu_tips_private.feed_state where serving_enabled and capture_enabled) then return jsonb_build_object('error','disabled');end if;
 select k.consumer_id,k.scopes into c,granted from edu_tips_private.data_keys k
 join edu_tips_private.erasure_consumers ec on ec.id=k.consumer_id
 where k.key_hash=p_key_hash and k.revoked_at is null and k.expires_at>statement_timestamp()
 and ec.environment=p_environment and ec.tenant_id='brandyaction' and ec.brand_id='brandyaction_edu';
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if p_scope is null or not p_scope=any(granted) then return jsonb_build_object('error','forbidden_scope');end if;
 insert into edu_tips_private.data_rates as r(consumer_id,window_at,used) values(c,w,1)
 on conflict(consumer_id) do update set window_at=w,used=case when r.window_at<>w then 1 else r.used+1 end
 where r.window_at<>w or r.used<30 returning used into n;
 if n is null then return jsonb_build_object('error','rate_limited');end if;
 return jsonb_build_object('consumer_id',c);
end$$;
create function public.edu_tips_prune_feed_content()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n bigint; result jsonb:='{}';
begin
 update edu_tips_private.feed_outbox set payload=null where expires_at<=statement_timestamp() and payload is not null;
 get diagnostics n=row_count;result:=result||jsonb_build_object('delivery_copies',n);
 update edu_tips_private.fact_versions set payload=null where expires_at<=statement_timestamp() and payload is not null;
 get diagnostics n=row_count;result:=result||jsonb_build_object('versions',n);
 update edu_tips_private.feed_facts set payload='{}' where expires_at<=statement_timestamp() and payload<>'{}'::jsonb;
 get diagnostics n=row_count;result:=result||jsonb_build_object('facts',n);
 update edu_tips_private.recovery_rows set payload=null where expires_at<=statement_timestamp() and payload is not null;
 get diagnostics n=row_count;result:=result||jsonb_build_object('snapshot_copies',n);
 delete from edu_tips_private.learning_days where (date_kst::timestamp at time zone 'Asia/Seoul')+interval '2160 hours'<=statement_timestamp();
 get diagnostics n=row_count;result:=result||jsonb_build_object('daily_evidence',n);
 -- Tombstones, evidence receipts, source ledgers and opaque ID mappings are not removed.
 return result;
end$$;
revoke all on function public.edu_tips_prune_feed_content() from public,anon,authenticated;
grant execute on function public.edu_tips_prune_feed_content() to service_role;
create function edu_tips_private.publish_feed()
returns void language plpgsql security invoker set search_path='' as $$
declare pending_row record; hi bigint;
begin
 select last_seq into hi from edu_tips_private.feed_state for update;
 -- A source transaction never holds this publisher lock while assigning a sequence.
 -- Only committed rows are visible. Earlier allocated UUIDs/timestamps are not watermarks.
 for pending_row in select id from edu_tips_private.feed_outbox where publish_seq is null order by queued_at,id limit 20000 loop
  hi:=hi+1;update edu_tips_private.feed_outbox set publish_seq=hi,published_at=clock_timestamp() where id=pending_row.id;
 end loop;
 if exists(select 1 from edu_tips_private.feed_outbox where publish_seq is null) then raise exception 'TIPS_FEED_UNAVAILABLE';end if;
 update edu_tips_private.feed_state set last_seq=hi;
 perform public.edu_tips_prune_feed_content();
 if exists(select 1 from edu_tips_private.feed_quarantine q join edu_tips_private.subjects s on s.member_id=q.member_id where edu_tips_private.subject_allowed(s.id)) then raise exception 'TIPS_SOURCE_INCONSISTENT';end if;
end$$;
create function public.edu_tips_data_operation(p_consumer uuid,p_key_hash text,p_environment text,p_action text,p_body jsonb,p_after text,p_limit integer,p_hashes text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare snapshot_time timestamptz; st edu_tips_private.feed_state; rec edu_tips_private.recoveries; cur edu_tips_private.data_cursors; ec edu_tips_private.erasure_consumers;
 required_scope text; stream_name text; pos bigint; hi bigint; slot integer:=0; rr record; items jsonb:='[]'; more boolean; exp timestamptz; h text;
 event_end edu_tips_private.data_cursors; learning_end edu_tips_private.data_cursors; delete_end edu_tips_private.erasure_cursors;
begin
 required_scope:=case p_action when 'events' then 'edu.events.read' when 'learning' then 'edu.learning.read' else 'edu.recovery' end;
 if p_action not in ('events','learning','recovery','complete') then raise exception 'TIPS_INVALID';end if;
 if not exists(select 1 from edu_tips_private.feed_state where serving_enabled and capture_enabled) then return jsonb_build_object('error','disabled');end if;
 -- Recheck after the HTTP gate; credential revocation must take effect on this request.
 if not exists(select 1 from edu_tips_private.data_keys k join edu_tips_private.erasure_consumers c on c.id=k.consumer_id
  where k.key_hash=p_key_hash and k.consumer_id=p_consumer and k.revoked_at is null and k.expires_at>statement_timestamp()
  and required_scope=any(k.scopes) and c.environment=p_environment and c.tenant_id='brandyaction' and c.brand_id='brandyaction_edu') then
  return jsonb_build_object('error','unauthorized');end if;
 if p_limit is null or p_limit not between 1 and 500 or cardinality(p_hashes)<>3 then raise exception 'TIPS_INVALID';end if;
 foreach h in array p_hashes loop if h is null or h !~ '^[0-9a-f]{64}$' then raise exception 'TIPS_INVALID';end if;end loop;
 if (select count(distinct value) from unnest(p_hashes) value)<>3 then raise exception 'TIPS_INVALID';end if;
 if exists(select 1 from edu_tips_private.subjects sb where edu_tips_private.subject_allowed(sb.id) and not exists(select 1 from edu_tips_private.projection_subjects ps where ps.subject_id=sb.id)) then raise exception 'TIPS_FEED_UNAVAILABLE';end if;
 perform edu_tips_private.publish_feed();select * into st from edu_tips_private.feed_state;
 select * into ec from edu_tips_private.erasure_consumers where id=p_consumer for update;
 if p_action='recovery' then
  select * into rec from edu_tips_private.recoveries where consumer_id=p_consumer and request_id=(p_body->>'requestId')::uuid;
  if found then
   if not exists(select 1 from edu_tips_private.data_sessions where consumer_id=p_consumer and recovery_id=rec.id) then raise exception 'TIPS_RECOVERY_REQUIRED';end if;
   if rec.reason<>p_body->>'reason' then raise exception 'TIPS_IDEMPOTENCY_CONFLICT';end if;
   if rec.expires_at<=statement_timestamp() then raise exception 'TIPS_CURSOR_EXPIRED';end if;
   if rec.generation<>st.generation then raise exception 'TIPS_RECOVERY_REQUIRED';end if;
   return jsonb_build_object('recovery_id',rec.id,'expires_at',rec.expires_at,'cutoff_at',rec.cutoff_at);
  end if;
  snapshot_time:=clock_timestamp();
  insert into edu_tips_private.recoveries(consumer_id,request_id,reason,generation,cutoff_seq,cutoff_at,expires_at)
   values(p_consumer,(p_body->>'requestId')::uuid,p_body->>'reason',st.generation,st.last_seq,snapshot_time,snapshot_time+interval '24 hours') returning * into rec;
  insert into edu_tips_private.data_sessions(consumer_id,recovery_id) values(p_consumer,rec.id) on conflict(consumer_id) do update set recovery_id=rec.id;
  -- Select immutable committed revisions at published H. Later source commits
  -- cannot enter this snapshot; their outbox receives a later publish sequence.
  insert into edu_tips_private.recovery_rows(recovery_id,stream,ordinal,subject_id,expires_at,payload)
  select rec.id,stream,row_number() over(partition by stream order by fact_id),subject_id,source_expiry,payload from (
   select distinct on(q.fact_id) q.fact_id,q.stream,q.subject_id,v.payload,v.expires_at source_expiry
   from edu_tips_private.feed_outbox q join edu_tips_private.fact_versions v on v.fact_id=q.fact_id and v.revision=q.revision
   where q.publish_seq<=rec.cutoff_seq and edu_tips_private.subject_allowed(q.subject_id)
   order by q.fact_id,q.publish_seq desc
  ) latest where payload is not null and source_expiry>statement_timestamp();
  foreach stream_name in array array['events','learning'] loop
   select coalesce(max(ordinal),0) into hi from edu_tips_private.recovery_rows where recovery_id=rec.id and stream=stream_name;
   insert into edu_tips_private.data_cursors(cursor_hash,consumer_id,stream,generation,position,upper_bound,recovery_id,mode,purpose,expires_at)
    values(p_hashes[case when stream_name='events' then 1 else 2 end],p_consumer,stream_name,st.generation,0,hi,rec.id,'snapshot','position',rec.expires_at);
  end loop;
  perform public.edu_tips_publish_erasures(p_consumer,500);
  select * into ec from edu_tips_private.erasure_consumers where id=p_consumer;
  insert into edu_tips_private.erasure_cursors(cursor_hash,consumer_id,position,upper_bound,purpose)
   values(p_hashes[3],p_consumer,ec.acked_ordinal,ec.last_ordinal,'position');
  return jsonb_build_object('recovery_id',rec.id,'expires_at',rec.expires_at,'cutoff_at',rec.cutoff_at);
 end if;
 if p_action='complete' then
  select * into rec from edu_tips_private.recoveries where id=(p_body->>'recovery_id')::uuid and consumer_id=p_consumer;
  if not found or not exists(select 1 from edu_tips_private.data_sessions where consumer_id=p_consumer and recovery_id=rec.id) then raise exception 'TIPS_RECOVERY_INCOMPLETE';end if;
  if rec.expires_at<=statement_timestamp() then raise exception 'TIPS_CURSOR_EXPIRED';end if;
  if rec.generation<>st.generation then raise exception 'TIPS_RECOVERY_REQUIRED';end if;
  select * into event_end from edu_tips_private.data_cursors where cursor_hash=p_body->>'event_through' and consumer_id=p_consumer and stream='events' and recovery_id=rec.id and purpose='position' and mode='incremental';
  select * into learning_end from edu_tips_private.data_cursors where cursor_hash=p_body->>'learning_through' and consumer_id=p_consumer and stream='learning' and recovery_id=rec.id and purpose='position' and mode='incremental';
  select * into delete_end from edu_tips_private.erasure_cursors where cursor_hash=p_body->>'tombstone_through' and consumer_id=p_consumer and purpose='position';
  if event_end.cursor_hash is null or learning_end.cursor_hash is null or delete_end.cursor_hash is null
   or not event_end.terminal or not learning_end.terminal or event_end.position<>st.last_seq or learning_end.position<>st.last_seq
   or event_end.expires_at<=statement_timestamp() or learning_end.expires_at<=statement_timestamp() or delete_end.expires_at<=statement_timestamp()
   then raise exception 'TIPS_RECOVERY_INCOMPLETE';end if;
  perform public.edu_tips_publish_erasures(p_consumer,500);
  select * into ec from edu_tips_private.erasure_consumers where id=p_consumer;
  if delete_end.position<>ec.last_ordinal or ec.acked_ordinal<>ec.last_ordinal
   or exists(select 1 from edu_tips_private.erasure_outbox q where not exists(select 1 from edu_tips_private.erasure_deliveries d where d.request_id=q.request_id and d.consumer_id=p_consumer))
   then raise exception 'TIPS_RECOVERY_INCOMPLETE';end if;
  update edu_tips_private.recoveries set completed_at=coalesce(completed_at,clock_timestamp()) where id=rec.id returning * into rec;
  return jsonb_build_object('recovery_id',rec.id,'status','reconciled','completed_at',rec.completed_at);
 end if;
 stream_name:=p_action;
 if p_after is null then raise exception 'TIPS_RECOVERY_REQUIRED';end if;
 select * into cur from edu_tips_private.data_cursors where cursor_hash=p_after and consumer_id=p_consumer and stream=stream_name and purpose='position';
 if not found then raise exception 'TIPS_UNKNOWN_CURSOR';end if;
 if cur.expires_at<=statement_timestamp() then raise exception 'TIPS_CURSOR_EXPIRED';end if;
 if cur.generation<>st.generation then raise exception 'TIPS_RECOVERY_REQUIRED';end if;
 select * into rec from edu_tips_private.recoveries where id=cur.recovery_id;
 if rec.id is null or not exists(select 1 from edu_tips_private.data_sessions where consumer_id=p_consumer and recovery_id=rec.id) then raise exception 'TIPS_RECOVERY_REQUIRED';end if;
 if rec.completed_at is null and rec.expires_at<=statement_timestamp() then raise exception 'TIPS_CURSOR_EXPIRED';end if;
 pos:=cur.position;hi:=cur.upper_bound;
 if cur.mode='snapshot' then
  for rr in select * from edu_tips_private.recovery_rows where recovery_id=rec.id and stream=stream_name and ordinal>pos and ordinal<=hi order by ordinal limit p_limit loop
   pos:=rr.ordinal;
   if rr.payload is not null and rr.expires_at>statement_timestamp() and edu_tips_private.subject_allowed(rr.subject_id) then items:=items||jsonb_build_array(rr.payload);end if;
  end loop;
  more:=pos<hi;
  if not more then pos:=rec.cutoff_seq;hi:=rec.cutoff_seq;end if;
 else
  if cur.position=cur.upper_bound then hi:=st.last_seq;end if;
  if exists(select 1 from edu_tips_private.feed_outbox q join edu_tips_private.fact_versions v on v.fact_id=q.fact_id and v.revision=q.revision
   where q.stream=stream_name and q.publish_seq>pos and q.publish_seq<=hi and q.expires_at<=statement_timestamp()
   and v.expires_at>statement_timestamp() and edu_tips_private.subject_allowed(q.subject_id)) then raise exception 'TIPS_CURSOR_EXPIRED';end if;
  for rr in select * from edu_tips_private.feed_outbox where publish_seq>pos and publish_seq<=hi order by publish_seq limit p_limit loop
   pos:=rr.publish_seq;
   if rr.stream=stream_name and rr.payload is not null and rr.expires_at>statement_timestamp() and edu_tips_private.subject_allowed(rr.subject_id) then items:=items||jsonb_build_array(rr.payload);end if;
  end loop;
  -- Missing/retired entries still advance the scan. Never restart at the last returned row.
  if not exists(select 1 from edu_tips_private.feed_outbox where publish_seq>pos and publish_seq<=hi) then pos:=hi;end if;
  more:=pos<hi;
 end if;
 exp:=case when rec.completed_at is null then rec.expires_at else clock_timestamp()+interval '30 days' end;
 insert into edu_tips_private.data_cursors(cursor_hash,consumer_id,stream,generation,position,upper_bound,recovery_id,mode,purpose,expires_at,terminal) values
  (p_hashes[1],p_consumer,stream_name,st.generation,pos,hi,rec.id,case when cur.mode='snapshot' and more then 'snapshot' else 'incremental' end,'position',exp,not more and cur.mode='incremental'),
  (p_hashes[2],p_consumer,stream_name,st.generation,hi,hi,rec.id,cur.mode,'upper',exp,false);
 return jsonb_build_object('items',items,'has_more',more,'stream_generation',st.generation);
end$$;
-- Revoke all default public rights, including helper/trigger functions, before commit.
alter table edu_tips_private.feed_state enable row level security;
revoke all on edu_tips_private.feed_state from public,anon,authenticated,service_role;
grant select on edu_tips_private.feed_state to service_role;
alter table edu_tips_private.data_keys enable row level security;
revoke all on edu_tips_private.data_keys from public,anon,authenticated,service_role;
grant select on edu_tips_private.data_keys to service_role;
alter table edu_tips_private.data_rates enable row level security;
revoke all on edu_tips_private.data_rates from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.data_rates to service_role;
alter table edu_tips_private.opaque_refs enable row level security;
revoke all on edu_tips_private.opaque_refs from public,anon,authenticated,service_role;
grant select,insert on edu_tips_private.opaque_refs to service_role;
alter table edu_tips_private.feed_facts enable row level security;
revoke all on edu_tips_private.feed_facts from public,anon,authenticated,service_role;
grant select,insert,update,delete on edu_tips_private.feed_facts to service_role;
alter table edu_tips_private.feed_outbox enable row level security;
revoke all on edu_tips_private.feed_outbox from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.feed_outbox to service_role;
alter table edu_tips_private.feed_quarantine enable row level security;
revoke all on edu_tips_private.feed_quarantine from public,anon,authenticated,service_role;
grant select,insert,update,delete on edu_tips_private.feed_quarantine to service_role;
alter table edu_tips_private.learning_days enable row level security;
revoke all on edu_tips_private.learning_days from public,anon,authenticated,service_role;
grant select,insert,update,delete on edu_tips_private.learning_days to service_role;
alter table edu_tips_private.recoveries enable row level security;
revoke all on edu_tips_private.recoveries from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.recoveries to service_role;
alter table edu_tips_private.recovery_rows enable row level security;
revoke all on edu_tips_private.recovery_rows from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.recovery_rows to service_role;
alter table edu_tips_private.data_cursors enable row level security;
revoke all on edu_tips_private.data_cursors from public,anon,authenticated,service_role;
grant select,insert on edu_tips_private.data_cursors to service_role;
grant update(last_seq,generation) on edu_tips_private.feed_state to service_role;
revoke all on function edu_tips_private.subject_allowed(uuid) from public,anon,authenticated;
revoke all on function edu_tips_private.opaque_ref(uuid,text,text) from public,anon,authenticated;
revoke all on function edu_tips_private.put_fact(uuid,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function edu_tips_private.capture_member(uuid) from public,anon,authenticated;
revoke all on function edu_tips_private.capture_source() from public,anon,authenticated;
revoke all on function edu_tips_private.purge_retired_feed() from public,anon,authenticated;
revoke all on function edu_tips_private.publish_feed() from public,anon,authenticated;
revoke all on function public.edu_tips_data_gate(text,text,text) from public,anon,authenticated;
revoke all on function public.edu_tips_data_operation(uuid,text,text,text,jsonb,text,integer,text[]) from public,anon,authenticated;
grant execute on function edu_tips_private.subject_allowed(uuid) to service_role;
grant execute on function edu_tips_private.opaque_ref(uuid,text,text) to service_role;
grant execute on function edu_tips_private.put_fact(uuid,text,text,timestamptz,timestamptz,jsonb) to service_role;
grant execute on function edu_tips_private.capture_member(uuid) to service_role;
grant execute on function edu_tips_private.publish_feed() to service_role;
grant execute on function public.edu_tips_data_gate(text,text,text) to service_role;
grant execute on function public.edu_tips_data_operation(uuid,text,text,text,jsonb,text,integer,text[]) to service_role;
alter table edu_tips_private.fact_versions enable row level security;
revoke all on edu_tips_private.fact_versions from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.fact_versions to service_role;
alter table edu_tips_private.data_sessions enable row level security;
revoke all on edu_tips_private.data_sessions from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.data_sessions to service_role;
alter table edu_tips_private.projection_subjects enable row level security;
revoke all on edu_tips_private.projection_subjects from public,anon,authenticated,service_role;
grant select,insert,update on edu_tips_private.projection_subjects to service_role;
commit;
