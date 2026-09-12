-- Save the course asset and a fresh campaign snapshot in one transaction.
create function public.edu_publish_live_asset(p_config jsonb,p_order jsonb,p_note text,p_revision integer,p_detail_image text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare lid uuid:=(p_config->>'id')::uuid; course public.courses; content jsonb; begin
  perform pg_advisory_xact_lock(hashtextextended(lid::text,0));
  if coalesce((select revision from public.landing_configs where id=lid),0)<>p_revision then raise exception 'STALE_REVISION'; end if;
  select * into course from public.courses where id=lid and list_price=0 for update;
  if not found then raise exception 'FREE_COURSE_REQUIRED'; end if;
  if p_detail_image is not null then
    update public.courses set metadata=(coalesce(metadata,'{}')-'detailImageUrl')||jsonb_build_object('detail_image_url',p_detail_image),updated_at=now() where id=lid returning * into course;
  end if;
  content:=jsonb_build_object('course',jsonb_build_object('id',course.id,'title',course.title,'summary',course.summary,'description',course.description,'metadata',course.metadata,'list_price',course.list_price,'schedule_label',course.schedule_label),'custom_sections',p_config->'custom_sections','sections',p_config->'sections','cta_label',p_config->'cta_label','kakao_url',p_config->'kakao_url');
  return public.edu_publish_landing(p_config,p_order,content,p_note,p_revision);
end $$;
revoke all on function public.edu_publish_live_asset(jsonb,jsonb,text,integer,text) from public,anon,authenticated;
grant execute on function public.edu_publish_live_asset(jsonb,jsonb,text,integer,text) to service_role;
