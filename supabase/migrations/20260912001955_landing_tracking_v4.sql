-- Campaign telemetry is separate from the learning/payment journey. Server API only.
create table public.landing_configs (
 id uuid primary key references public.courses(id), enabled boolean not null default true,
 kakao_url text not null default '', pixel_enabled boolean not null default false, pixel_id text not null default '',
 cta_label text not null default '무료 라이브 참여하기', campaign_start date not null default '2026-09-14', campaign_end date not null default '2026-09-28',
 custom_sections boolean not null default false, sections jsonb not null default '[]',
 thresholds jsonb not null default '{"min_sessions":300,"min_clicks":30,"cta_rate_min":null,"meta_ctr_min":3,"alive_seconds":5,"gap_percent":30}',
 layout_ver int not null default 0, revision int not null default 0, updated_at timestamptz not null default now(),
 check(campaign_end >= campaign_start), check(jsonb_typeof(sections)='array'), check(not pixel_enabled or pixel_id ~ '^[0-9]{5,30}$')
);
create table public.section_snapshots (
 landing_id uuid not null references public.landing_configs(id), layout_ver int not null,
 created_at timestamptz not null default now(), sections jsonb not null, content jsonb not null default '{}', note text not null default '',
 primary key(landing_id, layout_ver)
);
create table public.funnel_visitors (
 landing_id uuid not null references public.landing_configs(id), visitor_id uuid not null, first_session uuid not null, created_at timestamptz not null default now(),
 primary key(landing_id,visitor_id)
);
create table public.funnel_sessions (
 landing_id uuid not null, session_id uuid not null, visitor_id uuid not null, layout_ver int not null,
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), attribution jsonb not null,
 is_returning boolean not null default false, max_rank int not null default 0,
 sections jsonb not null default '{}', ctas jsonb not null default '{}', cta_sections jsonb not null default '{}', clicks int not null default 0, alive int not null default 0,
 primary key(landing_id,session_id,layout_ver),
 foreign key(landing_id,layout_ver) references public.section_snapshots(landing_id,layout_ver)
);
create index funnel_sessions_period on public.funnel_sessions(landing_id,created_at,layout_ver);
create index funnel_sessions_visitor on public.funnel_sessions(landing_id,visitor_id);
create table public.funnel_events (
 id uuid primary key, landing_id uuid not null, session_id uuid not null, visitor_id uuid not null, layout_ver int not null,
 created_at timestamptz not null default now(), event_type text not null check(event_type in ('view_page','view_section','click_cta','post_click_alive')),
 payload jsonb not null default '{}', dedup_key text not null,
 unique(landing_id,session_id,layout_ver,dedup_key),
 foreign key(landing_id,session_id,layout_ver) references public.funnel_sessions(landing_id,session_id,layout_ver)
);
create index funnel_events_period on public.funnel_events(landing_id,created_at);
create table public.landing_actuals (
 landing_id uuid not null references public.landing_configs(id), day date not null,
 joins integer check(joins>=0), exits integer check(exits>=0), live_peak integer check(live_peak>=0), payments integer check(payments>=0),
 updated_at timestamptz not null default now(), primary key(landing_id,day)
);
create table public.landing_meta_daily (
 landing_id uuid not null references public.landing_configs(id), day date not null, campaign text not null, adset text not null, creative text not null,
 impressions bigint not null check(impressions>=0), link_clicks bigint not null check(link_clicks>=0), spend numeric not null check(spend>=0),
 updated_at timestamptz not null default now(), primary key(landing_id,day,campaign,adset,creative)
);
-- No PUBLIC grants or browser access to identifiers, configuration drafts, or reports.
do $$ declare t text; begin foreach t in array array['landing_configs','section_snapshots','funnel_visitors','funnel_sessions','funnel_events','landing_actuals','landing_meta_daily'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop; end $$;

create function public.edu_publish_landing(p_config jsonb, p_order jsonb, p_content jsonb, p_note text, p_revision int)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.landing_configs; ver int; lid uuid := (p_config->>'id')::uuid; begin
 perform pg_advisory_xact_lock(hashtextextended(lid::text,0));
 if not exists(select 1 from public.courses where id=lid and list_price=0) then raise exception 'FREE_COURSE_REQUIRED'; end if;
 select * into old from public.landing_configs where id=lid for update;
 if coalesce(old.revision,0) <> p_revision then raise exception 'STALE_REVISION'; end if;
 ver := coalesce(old.layout_ver,0);
 if not exists(select 1 from public.section_snapshots where landing_id=lid and layout_ver=ver and sections=p_order and content=p_content) then
   ver:=ver+1;
 end if;
 insert into public.landing_configs(id,enabled,kakao_url,pixel_enabled,pixel_id,cta_label,campaign_start,campaign_end,custom_sections,sections,thresholds,layout_ver,revision)
 values(lid,(p_config->>'enabled')::boolean,p_config->>'kakao_url',(p_config->>'pixel_enabled')::boolean,p_config->>'pixel_id',p_config->>'cta_label',(p_config->>'campaign_start')::date,(p_config->>'campaign_end')::date,(p_config->>'custom_sections')::boolean,p_config->'sections',p_config->'thresholds',ver,p_revision+1)
 on conflict(id) do update set enabled=excluded.enabled,kakao_url=excluded.kakao_url,pixel_enabled=excluded.pixel_enabled,pixel_id=excluded.pixel_id,cta_label=excluded.cta_label,campaign_start=excluded.campaign_start,campaign_end=excluded.campaign_end,custom_sections=excluded.custom_sections,sections=excluded.sections,thresholds=excluded.thresholds,layout_ver=excluded.layout_ver,revision=excluded.revision,updated_at=now();
 insert into public.section_snapshots(landing_id,layout_ver,sections,content,note) values(lid,ver,p_order,p_content,left(p_note,500)) on conflict do nothing;
 return (select to_jsonb(c) from public.landing_configs c where id=lid);
end $$;
revoke all on function public.edu_publish_landing(jsonb,jsonb,jsonb,text,int) from public,anon,authenticated;
grant execute on function public.edu_publish_landing(jsonb,jsonb,jsonb,text,int) to service_role;

create function public.edu_ingest_landing(p_packet jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare
 lid uuid:=(p_packet->>'landing_id')::uuid; sid uuid:=(p_packet->>'session_id')::uuid; vid uuid:=(p_packet->>'visitor_id')::uuid; ver int:=(p_packet->>'layout_ver')::int;
 ev jsonb; pay jsonb; typ text; dedup text; sec text; pos int; inserted int; old_dwell int; old_cta jsonb; first_sid uuid; order_ids jsonb;
 sess public.funnel_sessions; snap public.section_snapshots;
begin
 if not exists(select 1 from public.landing_configs l join public.courses c on c.id=l.id where l.id=lid and l.enabled and c.status='published') then return; end if;
 select * into snap from public.section_snapshots where landing_id=lid and layout_ver=ver;
 if not found then return; end if;
 order_ids:=snap.sections;
 insert into public.funnel_visitors(landing_id,visitor_id,first_session) values(lid,vid,sid) on conflict do nothing;
 select first_session into first_sid from public.funnel_visitors where landing_id=lid and visitor_id=vid;
 insert into public.funnel_sessions(landing_id,session_id,visitor_id,layout_ver,attribution,is_returning)
 values(lid,sid,vid,ver,p_packet->'attribution',first_sid<>sid) on conflict do nothing;
 select * into sess from public.funnel_sessions where landing_id=lid and session_id=sid and layout_ver=ver for update;
 if sess.visitor_id<>vid or sess.clicks>500 then return; end if;
 for ev in select value from jsonb_array_elements(p_packet->'events') loop
   typ:=ev->>'event_type'; pay:=ev->'payload'; sec:=pay->>'section';
   if typ='view_page' then dedup:='page'; pay:=sess.attribution;
   elsif typ='view_section' then
     dedup:='section:'||sec;
     -- New names are accepted as observed; published layouts supply order for comparisons.
     select ordinality::int into pos from jsonb_array_elements_text(order_ids) with ordinality where value=sec;
     pos:=coalesce(pos,0);
   elsif typ='post_click_alive' then
     dedup:='alive:'||(pay->>'clickId');
     if not exists(select 1 from public.funnel_events where id=(pay->>'clickId')::uuid and landing_id=lid and session_id=sid and layout_ver=ver and event_type='click_cta' and payload->>'to'=pay->>'to') then continue; end if;
   else dedup:='click:'||(ev->>'id'); end if;
   insert into public.funnel_events(id,landing_id,session_id,visitor_id,layout_ver,event_type,payload,dedup_key)
   values((ev->>'id')::uuid,lid,sid,vid,ver,typ,pay,dedup) on conflict do nothing;
   get diagnostics inserted=row_count;
   if typ='view_section' then
     old_dwell:=coalesce((sess.sections->>sec)::int,-1);
     if (pay->>'dwellMs')::int>old_dwell then
       sess.sections:=jsonb_set(sess.sections,array[sec],pay->'dwellMs',true);
       update public.funnel_events set payload=pay where landing_id=lid and session_id=sid and layout_ver=ver and dedup_key=dedup;
     end if;
     sess.max_rank:=greatest(sess.max_rank,pos);
   elsif typ='click_cta' and inserted=1 then
     sess.clicks:=sess.clicks+1;
     sess.cta_sections:=jsonb_set(sess.cta_sections,array[(pay->>'to')||':'||coalesce(sec,'')],to_jsonb(coalesce((sess.cta_sections->>((pay->>'to')||':'||coalesce(sec,'')))::int,0)+1),true);
     old_cta:=coalesce(sess.ctas->(pay->>'to'),'{}');
     sess.ctas:=jsonb_set(sess.ctas,array[pay->>'to'],jsonb_build_object('clicks',coalesce((old_cta->>'clicks')::int,0)+1,'scroll_sum',coalesce((old_cta->>'scroll_sum')::numeric,0)+(pay->>'scrollPct')::numeric,'alive',coalesce((old_cta->>'alive')::int,0)),true);
   elsif typ='post_click_alive' and inserted=1 then
     sess.alive:=sess.alive+1;
     old_cta:=coalesce(sess.ctas->(pay->>'to'),'{}');
     sess.ctas:=jsonb_set(sess.ctas,array[pay->>'to'],old_cta||jsonb_build_object('alive',coalesce((old_cta->>'alive')::int,0)+1),true);
   end if;
 end loop;
 update public.funnel_sessions set sections=sess.sections,ctas=sess.ctas,cta_sections=sess.cta_sections,clicks=sess.clicks,alive=sess.alive,max_rank=sess.max_rank,last_seen_at=now() where landing_id=lid and session_id=sid and layout_ver=ver;
end $$;
revoke all on function public.edu_ingest_landing(jsonb) from public,anon,authenticated;
grant execute on function public.edu_ingest_landing(jsonb) to service_role;

-- A session summary is updated atomically at ingestion. Reports never scan 150k raw events.
create view public.landing_session_facts with(security_invoker=true) as
select s.*, (s.created_at at time zone 'Asia/Seoul')::date as day,
 coalesce(s.attribution->>'utm_campaign','') as campaign,coalesce(s.attribution->>'utm_term','') as adset,coalesce(s.attribution->>'utm_content','') as creative,
 case when lower(coalesce(s.attribution->>'utm_source',''))='meta' then 'meta' when coalesce(s.attribution->>'utm_source','')<>'' then 'other' when coalesce(s.attribution->>'referrer','')='' then 'direct' else 'other' end as traffic,
 coalesce(v.sections->>greatest(s.max_rank-1,0),'hero') as max_section,
 (s.clicks=0 and s.max_rank<=1) as bounced,
 (s.clicks=0 and s.max_rank>=jsonb_array_length(v.sections)) as completed_no_click
from public.funnel_sessions s join public.section_snapshots v using(landing_id,layout_ver);
revoke all on public.landing_session_facts from public,anon,authenticated;
grant select on public.landing_session_facts to service_role;

create function public.edu_landing_report(p_landing uuid,p_start timestamptz,p_end timestamptz,p_campaign text default '',p_adset text default '',p_creative text default '',p_traffic text default '',p_version int default null)
returns jsonb language sql stable security invoker set search_path='' as $$
with base as materialized (
 select * from public.landing_session_facts where landing_id=p_landing and created_at>=p_start and created_at<p_end
), f as materialized (
 select * from base where (p_campaign='' or campaign=p_campaign) and (p_adset='' or adset=p_adset) and (p_creative='' or creative=p_creative) and (p_traffic='' or traffic=p_traffic) and (p_version is null or layout_ver=p_version)
), g as (
 select layout_ver,campaign,adset,creative,traffic,count(*) sessions,sum(clicks) clicks,count(*) filter(where clicks>0) converted,sum(alive) alive,count(*) filter(where bounced) bounced,count(*) filter(where completed_no_click) completed_no_click,avg(max_rank) avg_depth,mode() within group(order by max_section) top_exit from f group by layout_ver,campaign,adset,creative,traffic
), ss as (
 select layout_ver,campaign,adset,creative,traffic,e.key section,count(*) reached,avg(e.value::text::numeric) dwell_ms from f cross join lateral jsonb_each(f.sections) e group by layout_ver,campaign,adset,creative,traffic,e.key
), daily as (
 select day,layout_ver,count(*) sessions,sum(clicks) clicks,count(*) filter(where clicks>0) converted,count(*) filter(where bounced) bounced from f group by day,layout_ver order by day,layout_ver
), ctas as (
 select layout_ver,e.key as position,sum((e.value->>'clicks')::int) clicks,sum((e.value->>'alive')::int) alive,sum((e.value->>'scroll_sum')::numeric)/nullif(sum((e.value->>'clicks')::int),0) avg_scroll from f cross join lateral jsonb_each(f.ctas) e group by layout_ver,e.key
), contexts as (
 select layout_ver,e.key context,sum(e.value::text::int) clicks from f cross join lateral jsonb_each(f.cta_sections) e group by layout_ver,e.key
), env as (
 select layout_ver,attribution->>'device' device,attribution->>'browser' browser,coalesce((attribution->>'isInApp')::boolean,false) in_app,is_returning as "returning",count(*) sessions,sum(clicks) clicks,count(*) filter(where clicks>0) converted,sum(alive) alive from f group by layout_ver,attribution->>'device',attribution->>'browser',coalesce((attribution->>'isInApp')::boolean,false),is_returning
)
select jsonb_build_object(
 'groups',coalesce((select jsonb_agg(to_jsonb(g)) from g),'[]'),
 'sections',coalesce((select jsonb_agg(to_jsonb(ss)) from ss),'[]'),
 'daily',coalesce((select jsonb_agg(to_jsonb(daily)) from daily),'[]'),
 'ctas',coalesce((select jsonb_agg(to_jsonb(ctas)) from ctas),'[]'),
 'cta_sections',coalesce((select jsonb_agg(to_jsonb(contexts)) from contexts),'[]'),
 'environment',coalesce((select jsonb_agg(to_jsonb(env)) from env),'[]'),
 'options',coalesce((select jsonb_agg(to_jsonb(o)) from(select distinct campaign,adset,creative,traffic from base) o),'[]'),
 'snapshots',coalesce((select jsonb_agg(jsonb_build_object('layout_ver',layout_ver,'sections',sections,'created_at',created_at,'note',note) order by layout_ver) from public.section_snapshots where landing_id=p_landing),'[]'),
 'actuals',coalesce((select jsonb_agg(to_jsonb(a) order by day) from public.landing_actuals a where landing_id=p_landing and day>=(p_start at time zone 'Asia/Seoul')::date and day<(p_end at time zone 'Asia/Seoul')::date),'[]'),
 'meta',coalesce((select jsonb_agg(to_jsonb(m) order by day) from public.landing_meta_daily m where landing_id=p_landing and day>=(p_start at time zone 'Asia/Seoul')::date and day<(p_end at time zone 'Asia/Seoul')::date and (p_campaign='' or campaign=p_campaign) and (p_adset='' or adset=p_adset) and (p_creative='' or creative=p_creative)),'[]'),
 'last_event_at',(select max(last_seen_at) from f)
)
$$;
revoke all on function public.edu_landing_report(uuid,timestamptz,timestamptz,text,text,text,text,int) from public,anon,authenticated;
grant execute on function public.edu_landing_report(uuid,timestamptz,timestamptz,text,text,text,text,int) to service_role;
