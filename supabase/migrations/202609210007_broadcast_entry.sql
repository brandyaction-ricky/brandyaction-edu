begin;
alter table public.edu_webinar_sessions add column broadcast_enabled boolean not null default false, add column offer_enabled boolean not null default false;
create table public.edu_broadcast_history (
 campaign_id uuid not null, phase text not null, revision integer not null, youtube_url text,
 broadcast_enabled boolean not null, offer_enabled boolean not null,
 actor_id uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(),
 primary key(campaign_id,phase,revision)
);
create table public.edu_broadcast_visits (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null, phase text not null,
 channel text not null check(channel in ('paid','organic','unknown')), target text not null check(target in ('live','offer')),
 revision integer not null, destination text not null, created_at timestamptz not null default now(),
 foreign key(campaign_id,phase) references public.edu_webinar_sessions(campaign_id,phase)
);
create index edu_broadcast_visits_counts on public.edu_broadcast_visits(campaign_id,phase,target,channel);
create index edu_broadcast_visits_rate on public.edu_broadcast_visits(campaign_id,created_at);
alter table public.edu_broadcast_history enable row level security;
alter table public.edu_broadcast_visits enable row level security;
revoke all on public.edu_broadcast_history,public.edu_broadcast_visits from public,anon,authenticated,service_role;
create function public.edu_manage_broadcast(p_actor uuid,p_code uuid,p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare authorized jsonb; campaign public.edu_webinar_campaigns%rowtype; item public.edu_webinar_sessions%rowtype;
 v_phase text; v_url text; live_enabled boolean; v_offer_enabled boolean; offer_ready boolean; result jsonb;
begin
 -- Reuse the existing role checks and campaign lock; read does not mutate attendance.
 authorized:=public.edu_manage_webinar_attendance(p_actor,p_code,null);
 select * into campaign from public.edu_webinar_campaigns where id=p_code;
 select exists(select 1 from public.cohorts c join public.courses s on s.id=c.course_id where c.id=campaign.paid_cohort_id and s.category='paid_class' and s.status='published') into offer_ready;
 if p_settings is not null then
  if jsonb_typeof(p_settings)<>'object' or not(p_settings ?& array['phase','url','enabled','offerEnabled','expected'])
   or p_settings-array['phase','url','enabled','offerEnabled','expected']<>'{}'::jsonb
   or jsonb_typeof(p_settings->'enabled')<>'boolean' or jsonb_typeof(p_settings->'offerEnabled')<>'boolean' then raise exception 'CONVERSION_INVALID'; end if;
  v_phase:=p_settings->>'phase';v_url:=p_settings->>'url';live_enabled:=(p_settings->>'enabled')::boolean;v_offer_enabled:=(p_settings->>'offerEnabled')::boolean;
  if v_phase is null or v_phase not in ('first','encore') or (live_enabled and v_url is null) or (v_offer_enabled and not offer_ready) or ((live_enabled or v_offer_enabled) and not campaign.enabled) then raise exception 'CONVERSION_INVALID'; end if;
  authorized:=public.edu_manage_webinar_attendance(p_actor,p_code,jsonb_build_object('phase',v_phase,'url',v_url,'open',false,'expected',p_settings->'expected'));
  update public.edu_webinar_sessions set broadcast_enabled=live_enabled,offer_enabled=v_offer_enabled where campaign_id=p_code and phase=v_phase returning * into item;
  insert into public.edu_broadcast_history values(p_code,v_phase,item.revision,v_url,live_enabled,v_offer_enabled,p_actor,now());
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('phase',s.phase,'url',s.youtube_url,'enabled',s.broadcast_enabled,'offerEnabled',s.offer_enabled,'revision',s.revision) order by s.phase),'[]'::jsonb) into result from public.edu_webinar_sessions s where s.campaign_id=p_code;
 return jsonb_build_object('sessions',result,'offerReady',offer_ready,'counts',(select coalesce(jsonb_agg(row_to_json(q)),'[]'::jsonb) from (select phase,channel,target,count(*) as requests from public.edu_broadcast_visits where campaign_id=p_code group by phase,channel,target) q));
end;
$$;
create function public.edu_broadcast_destination(p_code uuid,p_phase text,p_channel text,p_target text,p_record boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare campaign public.edu_webinar_campaigns%rowtype; item public.edu_webinar_sessions%rowtype; destination text; recorded boolean:=false;
begin
 if p_phase is null or p_phase not in ('first','encore') or p_channel is null or p_channel not in ('paid','organic','unknown') or p_target is null or p_target not in ('live','offer') then raise exception 'CONVERSION_INVALID'; end if;
 select * into campaign from public.edu_webinar_campaigns where id=p_code and enabled for update;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 perform 1 from public.courses where id=campaign.free_course_id and category='free' and list_price=0 and status='published' for share;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 select * into item from public.edu_webinar_sessions where campaign_id=p_code and phase=p_phase;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 if p_target='live' then
  if not item.broadcast_enabled or item.youtube_url is null then raise exception 'CONVERSION_NOT_FOUND'; end if;
  destination:=item.youtube_url;
 else
  if not item.offer_enabled then raise exception 'CONVERSION_NOT_FOUND'; end if;
  select '/classes/'||s.id::text into destination from public.cohorts c join public.courses s on s.id=c.course_id where c.id=campaign.paid_cohort_id and s.category='paid_class' and s.status='published' for share of c,s;
  if destination is null then raise exception 'CONVERSION_NOT_FOUND'; end if;
 end if;
 if p_record and (select count(*) from public.edu_broadcast_visits where campaign_id=p_code and created_at>now()-interval '1 minute')<1000 then
  insert into public.edu_broadcast_visits(campaign_id,phase,channel,target,revision,destination) values(p_code,p_phase,p_channel,p_target,item.revision,destination);recorded:=true;
 end if;
 return jsonb_build_object('url',destination,'recorded',recorded);
end;
$$;
revoke all on function public.edu_manage_broadcast(uuid,uuid,jsonb),public.edu_broadcast_destination(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.edu_manage_broadcast(uuid,uuid,jsonb),public.edu_broadcast_destination(uuid,text,text,text,boolean) to service_role;
commit;
