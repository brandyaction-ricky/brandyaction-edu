begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Private, hash-only credentials and issued cursors. No key/consumer/flag is seeded.
create table edu_tips_private.erasure_keys (
 key_hash text primary key check(key_hash ~ '^[0-9a-f]{64}$'),
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 scopes text[] not null check(scopes <@ array['edu.erasure.read','edu.erasure.ack']::text[]),
 revoked_at timestamptz,
 expires_at timestamptz not null
);
create table edu_tips_private.erasure_rate_limits (
 consumer_id uuid primary key references edu_tips_private.erasure_consumers(id),
 window_at timestamptz not null, used integer not null check(used between 1 and 60)
);
create table edu_tips_private.erasure_cursors (
 cursor_hash text primary key check(cursor_hash ~ '^[0-9a-f]{64}$'),
 consumer_id uuid not null references edu_tips_private.erasure_consumers(id),
 generation integer not null default 1 check(generation=1),
 position bigint not null check(position>=0),
 upper_bound bigint not null check(upper_bound>=position),
 purpose text not null check(purpose in ('position','snapshot')),
 expires_at timestamptz not null default (statement_timestamp()+interval '30 days')
);
create index edu_tips_erasure_cursor_expiry on edu_tips_private.erasure_cursors(expires_at);
create index edu_tips_erasure_keys_consumer on edu_tips_private.erasure_keys(consumer_id);
alter table edu_tips_private.erasure_keys enable row level security;
alter table edu_tips_private.erasure_rate_limits enable row level security;
alter table edu_tips_private.erasure_cursors enable row level security;
revoke all on edu_tips_private.erasure_keys,edu_tips_private.erasure_rate_limits,edu_tips_private.erasure_cursors from public,anon,authenticated,service_role;
grant select on edu_tips_private.erasure_keys to service_role;
grant select,insert,update on edu_tips_private.erasure_rate_limits to service_role;
grant select,insert on edu_tips_private.erasure_cursors to service_role;

create function public.edu_tips_erasure_http_gate(p_key_hash text,p_environment text,p_scope text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c uuid; granted text[]; n integer; w timestamptz:=date_trunc('minute',statement_timestamp());
begin
 select k.consumer_id,k.scopes into c,granted from edu_tips_private.erasure_keys k
 join edu_tips_private.erasure_consumers ec on ec.id=k.consumer_id
 where k.key_hash=p_key_hash and k.revoked_at is null and k.expires_at>statement_timestamp()
 and ec.environment=p_environment and ec.tenant_id='brandyaction' and ec.brand_id='brandyaction_edu';
 if not found then return jsonb_build_object('error','unauthorized');end if;
 if p_scope is null or not (p_scope=any(granted)) then return jsonb_build_object('error','forbidden');end if;
 -- Shared by every key and every deletion endpoint for this consumer.
 insert into edu_tips_private.erasure_rate_limits as r(consumer_id,window_at,used) values(c,w,1)
 on conflict(consumer_id) do update set window_at=w,used=case when r.window_at<>w then 1 else r.used+1 end
 where r.window_at<>w or r.used<60 returning used into n;
 if n is null then return jsonb_build_object('error','rate_limited');end if;
 return jsonb_build_object('consumer_id',c);
end$$;

create function edu_tips_private.resolve_erasure_cursor(p_consumer uuid,p_hash text)
returns edu_tips_private.erasure_cursors language plpgsql security invoker set search_path='' as $$
declare c edu_tips_private.erasure_cursors;
begin
 select * into c from edu_tips_private.erasure_cursors where cursor_hash=p_hash and consumer_id=p_consumer and generation=1 and purpose='position';
 if not found then raise exception 'TIPS_UNKNOWN_CURSOR';end if;
 if c.expires_at<=statement_timestamp() then raise exception 'TIPS_CURSOR_EXPIRED';end if;
 return c;
end$$;

-- Hashes correspond to fresh signed random tokens held only by the HTTP adapter.
-- All registration, publication and snapshot selection is one transaction.
create function public.edu_tips_erasure_http_page(p_consumer uuid,p_after text,p_limit integer,p_hashes text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c edu_tips_private.erasure_consumers; cur edu_tips_private.erasure_cursors;
 pos bigint; hi bigint; row_data record; items jsonb:='[]'; slot integer:=0; last_pos bigint; h text;
begin
 if p_limit is null or p_limit not between 1 and 500 or cardinality(p_hashes) is distinct from p_limit+3 then raise exception 'TIPS_INVALID';end if;
 foreach h in array p_hashes loop
  if h is null or h !~ '^[0-9a-f]{64}$' then raise exception 'TIPS_INVALID';end if;
 end loop;
 if (select count(distinct x) from unnest(p_hashes) x)<>cardinality(p_hashes) then raise exception 'TIPS_INVALID';end if;
 select * into c from edu_tips_private.erasure_consumers where id=p_consumer for update;
 if not found then raise exception 'TIPS_CONSUMER';end if;
 if p_after is not null then
  cur:=edu_tips_private.resolve_erasure_cursor(p_consumer,p_after);pos:=cur.position;
 else pos:=c.acked_ordinal;end if;
 if p_after is null or cur.position=cur.upper_bound then
  perform public.edu_tips_publish_erasures(p_consumer,500);
  select last_ordinal into hi from edu_tips_private.erasure_consumers where id=p_consumer;
 else hi:=cur.upper_bound;end if;
 last_pos:=pos;
 for row_data in select d.ordinal,q.request_id,s.customer_id,s.consent_epoch,q.reason,q.requested_at,q.active_due_at,q.model_due_at,q.residual_due_at
 from edu_tips_private.erasure_deliveries d join edu_tips_private.erasure_outbox q using(request_id)
 join edu_tips_private.subjects s on s.id=q.subject_id
 where d.consumer_id=p_consumer and d.ordinal>pos and d.ordinal<=hi order by d.ordinal limit p_limit loop
  slot:=slot+1;last_pos:=row_data.ordinal;
  insert into edu_tips_private.erasure_cursors(cursor_hash,consumer_id,position,upper_bound,purpose) values(p_hashes[slot],p_consumer,last_pos,hi,'position');
  items:=items||jsonb_build_array(jsonb_build_object('requestId',row_data.request_id,'customer_id',row_data.customer_id,'consent_epoch',row_data.consent_epoch,
   'reason',row_data.reason,'at',row_data.requested_at,'active_due_at',row_data.active_due_at,'model_due_at',row_data.model_due_at,'residual_due_at',row_data.residual_due_at,'cursor_slot',slot-1));
 end loop;
 insert into edu_tips_private.erasure_cursors(cursor_hash,consumer_id,position,upper_bound,purpose) values
  (p_hashes[p_limit+1],p_consumer,last_pos,hi,'position'),
  (p_hashes[p_limit+2],p_consumer,hi,hi,'snapshot');
 if c.acked_ordinal>0 then
  insert into edu_tips_private.erasure_cursors(cursor_hash,consumer_id,position,upper_bound,purpose) values(p_hashes[p_limit+3],p_consumer,c.acked_ordinal,greatest(hi,c.acked_ordinal),'position');
 end if;
 return jsonb_build_object('tombstones',items,'has_more',last_pos<hi,'has_ack',c.acked_ordinal>0,'stream_generation',1);
end$$;

create function public.edu_tips_erasure_http_ack(p_consumer uuid,p_through text,p_result_hash text)
returns void language plpgsql security invoker set search_path='' as $$
declare cur edu_tips_private.erasure_cursors; target uuid; result_id uuid; pos bigint; hi bigint;
begin
 if p_result_hash is null or p_result_hash !~ '^[0-9a-f]{64}$' then raise exception 'TIPS_INVALID';end if;
 perform 1 from edu_tips_private.erasure_consumers where id=p_consumer for update;
 if not found then raise exception 'TIPS_CONSUMER';end if;
 cur:=edu_tips_private.resolve_erasure_cursor(p_consumer,p_through);
 select delivery_id into target from edu_tips_private.erasure_deliveries where consumer_id=p_consumer and ordinal=cur.position;
 if target is null then raise exception 'TIPS_UNKNOWN_CURSOR';end if;
 result_id:=public.edu_tips_ack_erasures(p_consumer,target);
 select ordinal into pos from edu_tips_private.erasure_deliveries where consumer_id=p_consumer and delivery_id=result_id;
 select last_ordinal into hi from edu_tips_private.erasure_consumers where id=p_consumer;
 insert into edu_tips_private.erasure_cursors(cursor_hash,consumer_id,position,upper_bound,purpose) values(p_result_hash,p_consumer,pos,hi,'position');
end$$;
revoke all on function edu_tips_private.resolve_erasure_cursor(uuid,text),public.edu_tips_erasure_http_gate(text,text,text),public.edu_tips_erasure_http_page(uuid,text,integer,text[]),public.edu_tips_erasure_http_ack(uuid,text,text) from public,anon,authenticated;
grant execute on function edu_tips_private.resolve_erasure_cursor(uuid,text),public.edu_tips_erasure_http_gate(text,text,text),public.edu_tips_erasure_http_page(uuid,text,integer,text[]),public.edu_tips_erasure_http_ack(uuid,text,text) to service_role;
commit;
