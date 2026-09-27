begin;
create table public.edu_recruitment_marketing_revisions (
 period_id text not null references public.edu_webinar_campaigns(period_id),
 revision integer not null check(revision>0), free_course_id uuid not null,
 campaign_ids uuid[] not null, actor_id uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), primary key(period_id,revision)
);
create table public.edu_recruitment_marketing_links (
 campaign_id uuid primary key references public.landing_campaigns(id),
 period_id text not null references public.edu_webinar_campaigns(period_id)
);
create index on public.edu_recruitment_marketing_links(period_id);
alter table public.edu_recruitment_marketing_revisions enable row level security;
alter table public.edu_recruitment_marketing_links enable row level security;
revoke all on public.edu_recruitment_marketing_revisions,public.edu_recruitment_marketing_links from public,anon,authenticated,service_role;

create function public.edu_manage_recruitment_marketing(p_actor uuid,p_period text,p_settings jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype; perms jsonb; webinar public.edu_webinar_campaigns%rowtype;
 revision integer; ids uuid[]; candidates jsonb; selected jsonb;
begin
 select * into actor from public.profiles where id=p_actor and status='active' for share;
 if not found or actor.role not in ('admin','staff') then raise exception 'CONVERSION_FORBIDDEN'; end if;
 if actor.role='staff' then
  select value into perms from public.site_settings where key='edu_staff_permissions_'||p_actor::text for share;
  if perms->'marketing' is distinct from 'true'::jsonb or perms->'products' is distinct from 'true'::jsonb then raise exception 'CONVERSION_FORBIDDEN'; end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(207260921,9);
 select * into webinar from public.edu_webinar_campaigns where period_id=p_period for share;
 if not found then raise exception 'CONVERSION_NOT_FOUND'; end if;
 select coalesce(max(r.revision),0) into revision from public.edu_recruitment_marketing_revisions r where r.period_id=p_period;
 if p_settings is not null then
  if jsonb_typeof(p_settings)<>'object' or not(p_settings ?& array['expected','webinarRevision','freeCourse','campaignIds'])
   or p_settings-array['expected','webinarRevision','freeCourse','campaignIds']<>'{}'::jsonb
   or jsonb_typeof(p_settings->'campaignIds') is distinct from 'array' then raise exception 'CONVERSION_INVALID'; end if;
  if jsonb_array_length(p_settings->'campaignIds')>20 then raise exception 'CONVERSION_INVALID'; end if;
  if (p_settings->>'expected')::integer is distinct from revision or (p_settings->>'webinarRevision')::integer is distinct from webinar.revision
   or (p_settings->>'freeCourse')::uuid is distinct from webinar.free_course_id then raise exception 'CONVERSION_STALE'; end if;
  select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(p_settings->'campaignIds');
  if exists(select 1 from unnest(ids) i group by i having count(*)>1) or array_position(ids,null) is not null then raise exception 'CONVERSION_INVALID'; end if;
  perform 1 from public.landing_campaigns where id=any(ids) for share;
  if (select count(*) from public.landing_campaigns where id=any(ids) and landing_id=webinar.free_course_id)<>cardinality(ids) then raise exception 'CONVERSION_INVALID'; end if;
  if exists(select 1 from public.edu_recruitment_marketing_links where campaign_id=any(ids) and period_id<>p_period) then raise exception 'MARKETING_ALREADY_LINKED'; end if;
  delete from public.edu_recruitment_marketing_links where period_id=p_period;
  insert into public.edu_recruitment_marketing_links select unnest(ids),p_period;
  revision:=revision+1;
  insert into public.edu_recruitment_marketing_revisions values(p_period,revision,webinar.free_course_id,ids,p_actor,now());
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'start',c.start_day,'end',c.end_day,'usesAds',c.uses_ads,'available',l.period_id is null or l.period_id=p_period) order by c.start_day desc,c.id),'[]'::jsonb)
 into candidates from public.landing_campaigns c left join public.edu_recruitment_marketing_links l on l.campaign_id=c.id where c.landing_id=webinar.free_course_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'start',c.start_day,'end',c.end_day,'usesAds',c.uses_ads,'valid',c.landing_id=webinar.free_course_id) order by c.start_day,c.id),'[]'::jsonb)
 into selected from public.edu_recruitment_marketing_links l join public.landing_campaigns c on c.id=l.campaign_id where l.period_id=p_period;
 return jsonb_build_object('revision',revision,'freeCourse',webinar.free_course_id,'webinarRevision',webinar.revision,'candidates',candidates,'selected',selected);
end $$;
revoke all on function public.edu_manage_recruitment_marketing(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.edu_manage_recruitment_marketing(uuid,text,jsonb) to service_role;
commit;
