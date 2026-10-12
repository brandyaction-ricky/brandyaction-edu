-- Correct expired timestamp revisions without changing the previously applied migration.
-- Preserve opaque identities and deletion/audit metadata; do not alter financial source rows.
begin;
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
   update edu_tips_private.feed_state set generation=generation+1;
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
revoke all on function edu_tips_private.put_fact(uuid,text,text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function edu_tips_private.put_fact(uuid,text,text,timestamptz,timestamptz,jsonb) to service_role;
commit;
