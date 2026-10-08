-- Reuse the canonical course/cohort catalog inside one MVCC snapshot.
-- Only enrollment_id is expanded per learner; eligibility and item multiplicity stay unchanged.
-- Refuse to apply if the canonical helper changed its enrollment dependencies.
begin;
set local lock_timeout='5s';
do $migration$
declare
 definition text;
 old_fragment constant text := $old$'catalog',coalesce((select jsonb_agg(to_jsonb(x)) from (select e.id enrollment_id,c.item_type,c.item_id from public.enrollments e join public.edu_analytics_members m on m.id=e.user_id join public.order_items i on i.id=e.order_item_id join public.edu_analytics_orders o on o.id=i.order_id cross join lateral public.edu_learning_usage_catalog(e.id) c where e.source='purchase') x),'[]'::jsonb),$old$;
 new_fragment constant text := $new$'catalog',coalesce((
   with eligible as materialized (
    select e.id,e.course_id,e.cohort_id from public.enrollments e
    join public.edu_analytics_members m on m.id=e.user_id
    join public.order_items i on i.id=e.order_item_id
    join public.edu_analytics_orders o on o.id=i.order_id where e.source='purchase'
   ), representatives as (
    select distinct on (course_id,cohort_id) id,course_id,cohort_id
    from eligible order by course_id,cohort_id,id
   ), catalog as materialized (
    select r.course_id,r.cohort_id,c.item_type,c.item_id from representatives r
    cross join lateral public.edu_learning_usage_catalog(r.id) c
   )
   select jsonb_agg(to_jsonb(x)) from (
    select e.id enrollment_id,c.item_type,c.item_id from eligible e join catalog c
    on c.course_id is not distinct from e.course_id and c.cohort_id is not distinct from e.cohort_id
   ) x
  ),'[]'::jsonb),$new$;
begin
 if (select md5(prosrc) from pg_proc where oid='public.edu_learning_usage_catalog(uuid)'::regprocedure)
    <> 'b142fd398c08a221365cc2b25ce25b56' then
  raise exception 'EXPORT_CATALOG_DEPENDENCY_CHANGED';
 end if;
 definition := pg_get_functiondef('public.edu_export_v1_source(date,date,timestamptz)'::regprocedure);
 if strpos(definition,new_fragment)>0 then return; end if;
 if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment)<>1 then
  raise exception 'EXPORT_CATALOG_SOURCE_CHANGED';
 end if;
 execute replace(definition,old_fragment,new_fragment);
end $migration$;
commit;
