-- Keep Supabase/PostgREST safeupdate enabled: constrain every singleton update.
-- Functions, identities, source money, gates and access grants otherwise remain unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function edu_tips_private.put_fact(s uuid,st text,k text,at timestamptz,expiry timestamptz,p jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare f edu_tips_private.feed_facts; rev bigint; body jsonb; effective_expiry timestamptz;
begin
 select * into f from edu_tips_private.feed_facts where subject_id=s and stream=st and record_key=k for update;
 effective_expiry:=least(expiry,coalesce(f.expires_at,expiry));
 -- A corrected original timestamp may make an existing retained revision expire.
 -- Remove every analysis copy of that record and require manifest reconciliation.
 if effective_expiry<=statement_timestamp() then
  if f.id is not null then
   update edu_tips_private.recovery_rows set payload=null
    where subject_id=s and stream=st
     and payload->>(case when st='events' then 'event_id' else 'record_id' end)
      =f.payload->>(case when st='events' then 'event_id' else 'record_id' end);
   update edu_tips_private.feed_outbox set payload=null where fact_id=f.id;
   delete from edu_tips_private.feed_facts where id=f.id;
   update edu_tips_private.feed_state set generation=generation+1 where singleton;
  end if;
  return;
 end if;
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
create or replace function edu_tips_private.capture_member(p_member uuid)
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
   update edu_tips_private.feed_state set generation=generation+1 where singleton;
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
create or replace function edu_tips_private.publish_feed()
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
 update edu_tips_private.feed_state set last_seq=hi where singleton;
 perform public.edu_tips_prune_feed_content();
 if exists(select 1 from edu_tips_private.feed_quarantine q join edu_tips_private.subjects s on s.member_id=q.member_id where edu_tips_private.subject_allowed(s.id)) then raise exception 'TIPS_SOURCE_INCONSISTENT';end if;
end$$;
commit;
