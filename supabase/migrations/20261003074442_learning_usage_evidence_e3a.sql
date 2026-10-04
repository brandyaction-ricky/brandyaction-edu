begin;

-- One row per entitlement/type/item. Repeated delivery requests never inflate usage.
alter table public.learning_usage_events drop constraint learning_usage_events_item_type_check;
alter table public.learning_usage_events add constraint learning_usage_events_item_type_check
  check(item_type in ('vod_complete','material_download','live_join','replay_view'));
alter table public.learning_usage_events add column evidence_source text not null default 'legacy_record';
revoke all on public.learning_usage_events from public,anon,authenticated;

-- Current registered composition, including not-yet-released items. This is NOT
-- a purchase-time contract snapshot and must not automatically decide refunds.
create function public.edu_learning_usage_catalog(p_enrollment uuid)
returns table(item_type text,item_id uuid,title text,available boolean)
language sql stable security invoker set search_path='' as $$
 with enrollment as (select course_id,cohort_id from public.enrollments where id=p_enrollment),
 lessons as (
   select l.id,l.title,c.vod_url,c.resource_storage_path,
     exists(select 1 from public.edu_lesson_block_heads h join public.edu_lesson_block_versions v on v.id=h.revision,
       lateral jsonb_array_elements(v.document->'blocks') b where h.lesson_id=l.id and b->>'type'='video') as block_video,
     public.edu_cohort_lesson_visible(e.cohort_id,l.id) as available
   from enrollment e join public.curriculum_weeks w on w.course_id=e.course_id
   join public.curriculum_lessons l on l.week_id=w.id left join public.lesson_contents c on c.lesson_id=l.id
   where w.archived_at is null and l.archived_at is null
 ), resources as (
   select r from enrollment e join public.courses c on c.id=e.course_id,
     lateral jsonb_array_elements(case when jsonb_typeof(c.metadata->'product_resources')='array'
       then c.metadata->'product_resources' else '[]'::jsonb end) r
   where r->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and coalesce(r->>'path','')<>'' and r->>'scope' in ('enrolled','purchaser')
 ), sessions as (
   select s.id,s.title,s.is_public,c.live_url,c.replay_url,c.resource_storage_path
   from enrollment e join public.cohort_sessions s on s.cohort_id=e.cohort_id
   join public.cohort_session_contents c on c.session_id=s.id
 )
 select 'vod_complete',id,title,available from lessons where nullif(vod_url,'') is not null or block_video
 union all select 'material_download',id,title,available from lessons where nullif(resource_storage_path,'') is not null
 union all select distinct 'material_download',(r->>'id')::uuid,r->>'name',true from resources
 union all select 'live_join',id,title,is_public from sessions where nullif(live_url,'') is not null
 union all select 'replay_view',id,title,is_public from sessions where nullif(replay_url,'') is not null
 union all select 'material_download',id,title,is_public from sessions where nullif(resource_storage_path,'') is not null
$$;

create function public.edu_record_learning_usage(p_actor uuid,p_enrollment uuid,p_type text,p_item uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_type is null or p_type not in ('material_download','live_join','replay_view') then raise exception 'USAGE_INVALID'; end if;
 if not exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
   where e.id=p_enrollment and e.user_id=p_actor and p.status='active' and p.role not in ('admin','staff')
     and e.status='active' and e.revoked_at is null
     and (e.access_starts_at is null or e.access_starts_at<=now()) and (e.access_ends_at is null or e.access_ends_at>now()))
   then raise exception 'USAGE_FORBIDDEN'; end if;
 if not exists(select 1 from public.edu_learning_usage_catalog(p_enrollment) c where c.item_type=p_type and c.item_id=p_item and c.available)
   then raise exception 'USAGE_NOT_AVAILABLE'; end if;
 insert into public.learning_usage_events(enrollment_id,item_type,item_id,evidence_source)
 values(p_enrollment,p_type,p_item,case p_type when 'material_download' then 'signed_file_issued' when 'live_join' then 'entry_link' else 'replay_link' end)
 on conflict(enrollment_id,item_type,item_id) do update set last_used_at=now(),use_count=public.learning_usage_events.use_count+1;
end $$;

-- All completion paths (legacy, self-completion and mentor approval) share the
-- committed progress row. Do not create VOD events on submission alone.
create function public.edu_sync_vod_usage()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.completed_at is not null and exists(select 1 from public.edu_learning_usage_catalog(new.enrollment_id) c
    where c.item_type='vod_complete' and c.item_id=new.lesson_id)
    and exists(select 1 from public.enrollments e join public.profiles p on p.id=e.user_id
      where e.id=new.enrollment_id and p.role not in ('admin','staff')) then
   insert into public.learning_usage_events(enrollment_id,item_type,item_id,first_used_at,last_used_at,evidence_source)
   values(new.enrollment_id,'vod_complete',new.lesson_id,new.completed_at,new.completed_at,'lesson_progress')
   on conflict(enrollment_id,item_type,item_id) do nothing;
 end if;
 return new;
end $$;
create trigger edu_vod_usage_after_progress after insert or update of completed_at on public.lesson_progress
for each row execute function public.edu_sync_vod_usage();

-- Backfill only real, timestamped VOD completions. Never invent past downloads
-- or live/replay use. Keep historical records if content is later changed.
insert into public.learning_usage_events(enrollment_id,item_type,item_id,first_used_at,last_used_at,evidence_source)
select p.enrollment_id,'vod_complete',p.lesson_id,p.completed_at,p.completed_at,'lesson_progress_backfill'
from public.lesson_progress p join public.enrollments e on e.id=p.enrollment_id join public.profiles m on m.id=e.user_id
where p.completed_at is not null and m.role not in ('admin','staff') and exists(
 select 1 from public.edu_learning_usage_catalog(p.enrollment_id) c where c.item_type='vod_complete' and c.item_id=p.lesson_id)
on conflict(enrollment_id,item_type,item_id) do nothing;

create function public.edu_admin_learning_usage(p_actor uuid,p_member uuid,p_page integer default 1)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.edu_assert_block_reviewer(p_actor);
 if p_member is null or p_page is null or p_page not between 1 and 100000 then raise exception 'USAGE_INVALID'; end if;
 with enrolled as materialized (
   select e.*,c.title as course_title,h.name as cohort_name from public.enrollments e
   join public.courses c on c.id=e.course_id left join public.cohorts h on h.id=e.cohort_id where e.user_id=p_member
 ), page as (select * from enrolled order by id limit 10 offset (p_page-1)*10), rows as (
   select e.id, jsonb_build_object('enrollmentId',e.id,'courseTitle',e.course_title,'cohortName',e.cohort_name,
   'enrollmentStatus',e.status,'compositionBasis','current_registered_not_contract_snapshot',
   'items',coalesce((select jsonb_agg(jsonb_build_object('type',c.item_type,'id',c.item_id,'title',c.title,'available',c.available,
     'firstUsedAt',u.first_used_at,'lastUsedAt',u.last_used_at,'requests',u.use_count,'source',u.evidence_source) order by c.item_type,c.title,c.item_id)
     from public.edu_learning_usage_catalog(e.id) c left join public.learning_usage_events u
       on u.enrollment_id=e.id and u.item_type=c.item_type and u.item_id=c.item_id),'[]'::jsonb),
   'historicalItems',coalesce((select jsonb_agg(jsonb_build_object('type',u.item_type,'id',u.item_id,'firstUsedAt',u.first_used_at,
     'lastUsedAt',u.last_used_at,'requests',u.use_count,'source',u.evidence_source) order by u.first_used_at,u.id)
     from public.learning_usage_events u where u.enrollment_id=e.id and not exists(select 1 from public.edu_learning_usage_catalog(e.id) c
       where c.item_type=u.item_type and c.item_id=u.item_id)),'[]'::jsonb)) as value from page e
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(value order by id) from rows),'[]'::jsonb),
   'total',(select count(*) from enrolled),'page',p_page,'pageSize',10) into result;
 return result;
end $$;

revoke all on function public.edu_learning_usage_catalog(uuid),public.edu_record_learning_usage(uuid,uuid,text,uuid),
 public.edu_sync_vod_usage(),public.edu_admin_learning_usage(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.edu_learning_usage_catalog(uuid),public.edu_record_learning_usage(uuid,uuid,text,uuid),
 public.edu_admin_learning_usage(uuid,uuid,integer) to service_role;
commit;
