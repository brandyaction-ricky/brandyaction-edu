-- Platform-generated PRD-<request UUID> codes fail the export's UUID privacy rule.
-- Keep the privacy contract unchanged; assign stable, non-personal business codes.
-- Existing manual codes, product IDs, slugs and foreign-key relationships stay intact.
begin;
set local lock_timeout='5s';

create or replace function public.edu_normalize_automatic_product_code()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.course_code ~ '^PRD-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  new.course_code := 'PRD-' || upper(substr(md5(new.course_code),1,16));
 end if;
 return new;
end $$;
revoke all on function public.edu_normalize_automatic_product_code() from public,anon,authenticated,service_role;
drop trigger if exists edu_normalize_automatic_product_code on public.courses;
create trigger edu_normalize_automatic_product_code before insert or update of course_code
 on public.courses for each row execute function public.edu_normalize_automatic_product_code();

-- Record each original code for an exact rollback. All changes share one transaction.
-- The existing unique constraint aborts the entire migration on any collision.
with previous as materialized (
 select id,course_code from public.courses
 where course_code ~ '^PRD-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 for update
), changed as (
 update public.courses c set course_code=p.course_code from previous p where c.id=p.id
 returning c.id,c.course_code
)
insert into public.audit_logs(action,entity_type,entity_id,before_data,after_data)
 select 'product.export_code_normalized.v1','course',c.id::text,
 jsonb_build_object('course_code',p.course_code),jsonb_build_object('course_code',c.course_code)
 from changed c join previous p using(id);
commit;
