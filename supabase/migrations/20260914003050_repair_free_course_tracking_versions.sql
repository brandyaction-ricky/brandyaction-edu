-- Repair free products that already pointed at a missing measurement snapshot.
update public.landing_configs l
set enabled = true,
    layout_ver = greatest(l.layout_ver, 1),
    revision = greatest(l.revision, 1),
    updated_at = now()
from public.courses c
where c.id = l.id
  and c.category = 'free'
  and coalesce(c.list_price, 0) = 0
  and c.archived_at is null;

insert into public.section_snapshots (landing_id, layout_ver, sections, content, note)
select l.id, l.layout_ver, '["detail","materials"]'::jsonb, '{}'::jsonb,
  '무료 상품 트래킹 측정 버전 복구'
from public.landing_configs l
join public.courses c on c.id = l.id
where c.category = 'free'
  and coalesce(c.list_price, 0) = 0
  and c.archived_at is null
  and l.layout_ver >= 1
on conflict (landing_id, layout_ver) do nothing;

create or replace function public.edu_ensure_free_course_tracking()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tracking_version integer;
begin
  if new.category = 'free' and coalesce(new.list_price, 0) = 0 and new.archived_at is null then
    insert into public.landing_configs (
      id, enabled, kakao_url, cta_label, campaign_start, campaign_end,
      custom_sections, sections, layout_ver, revision
    ) values (
      new.id, true, coalesce(new.metadata->>'cta_url', ''),
      coalesce(nullif(btrim(new.metadata->>'cta_label'), ''), '참여하기'),
      current_date, current_date + 3650, false, '[]'::jsonb, 1, 1
    )
    on conflict (id) do update
      set enabled = true,
          layout_ver = greatest(public.landing_configs.layout_ver, 1),
          revision = greatest(public.landing_configs.revision, 1),
          updated_at = now();

    select layout_ver into tracking_version from public.landing_configs where id = new.id;
    insert into public.section_snapshots (landing_id, layout_ver, sections, content, note)
    values (new.id, tracking_version, '["detail","materials"]'::jsonb, '{}'::jsonb,
      '무료 상품 트래킹 자동 설정')
    on conflict (landing_id, layout_ver) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.edu_ensure_free_course_tracking() from public, anon, authenticated;
grant execute on function public.edu_ensure_free_course_tracking() to service_role;
