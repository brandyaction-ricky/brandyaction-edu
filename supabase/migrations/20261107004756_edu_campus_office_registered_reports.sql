begin;
-- A verified, single-owner connector may register only its owner's active enrollment.
-- No new credential store, table grants, or learner write permissions.
create function private.campus_office_register(p_connector text,p_key_version text,p_allowed_owners uuid[],p_event_id uuid,p_payload_hash text,p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 owner uuid; enrollment uuid := (p_event->>'enrollmentId')::uuid;
 job uuid := (p_event->>'jobId')::uuid; objective text := btrim(p_event->>'objective');
 prev private.edu_campus_office_events; result jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' or cardinality(p_allowed_owners) is distinct from 1 then
   raise exception 'connector scope' using errcode='42501';
 end if;
 owner := p_allowed_owners[1];
 if owner is null or not private.campus_office_scope(enrollment,owner) or not exists (
   select 1 from private.edu_campus_office_connectors c where c.connector_id=p_connector and c.owner_id=owner and c.key_version=p_key_version and c.enabled
 ) then raise exception 'connector scope' using errcode='42501'; end if;
 if p_connector is null or p_event_id is null or job is null or p_payload_hash is null or p_payload_hash !~ '^[a-f0-9]{64}$'
   or p_event->>'event' is distinct from 'registered' or objective is null or length(objective) not between 10 and 2000
   or (p_event->>'outputType' in ('plan','copy','checklist','analysis')) is not true or octet_length(p_event::text)>12000 then
   raise exception 'invalid registration' using errcode='23514';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_connector||p_event_id::text,2));
 perform pg_advisory_xact_lock(hashtextextended(owner::text,3));
 select * into prev from private.edu_campus_office_events r where r.connector_id=p_connector and r.event_id=p_event_id;
 if prev.event_id is not null then
   if prev.payload_hash<>p_payload_hash or prev.job_id<>job or not exists(select 1 from public.edu_campus_office_jobs j where j.id=job and j.owner_id=owner and j.enrollment_id=enrollment) then
     raise exception 'replay conflict' using errcode='40001';
   end if;
   return prev.result;
 end if;
 if exists(select 1 from public.edu_campus_office_jobs where id=job) then raise exception 'job conflict' using errcode='40001'; end if;
 if (select count(*) from public.edu_campus_office_jobs where owner_id=owner and enrollment_id=enrollment and status<>'archived')>=50
   or (select count(*) from public.edu_campus_office_jobs where owner_id=owner and enrollment_id=enrollment)>=200
   or (select count(*) from public.edu_campus_office_jobs where owner_id=owner and created_at>now()-interval '1 minute')>=10 then
   raise exception 'request limit' using errcode='40001';
 end if;
 insert into public.edu_campus_office_jobs(id,owner_id,enrollment_id,objective,material_urls,output_type,connector_id)
 values(job,owner,enrollment,objective,'{}',p_event->>'outputType',p_connector);
 insert into public.edu_campus_office_history(job_id,revision,actor_type,action,status,note)
 values(job,1,'connector','registered','awaiting_connection','Telegram에서 캠퍼스 업무로 지정한 요청을 등록했습니다.');
 result := jsonb_build_object('jobId',job,'revision',1,'status','awaiting_connection');
 insert into private.edu_campus_office_events(connector_id,event_id,job_id,payload_hash,result) values(p_connector,p_event_id,job,p_payload_hash,result);
 return result;
end;
$$;
create function public.edu_campus_office_register(p_connector text,p_key_version text,p_allowed_owners uuid[],p_event_id uuid,p_payload_hash text,p_event jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.campus_office_register(p_connector,p_key_version,p_allowed_owners,p_event_id,p_payload_hash,p_event);
$$;
revoke all on function private.campus_office_register(text,text,uuid[],uuid,text,jsonb),public.edu_campus_office_register(text,text,uuid[],uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.campus_office_register(text,text,uuid[],uuid,text,jsonb),public.edu_campus_office_register(text,text,uuid[],uuid,text,jsonb) to service_role;
commit;
