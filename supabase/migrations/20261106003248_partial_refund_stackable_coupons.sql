begin;
alter table public.coupons add column is_stackable boolean not null default false;
comment on column public.coupons.is_stackable is 'Allows this coupon to be added to one ordinary coupon or other stackable coupons; eligibility and usage limits still apply.';

create or replace function public.edu_save_coupon(p_actor uuid,p_id uuid,p_values jsonb,p_products uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.coupons%rowtype; existing public.coupons%rowtype;
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception 'ADMIN_REQUIRED'; end if;
  if p_id is null then raise exception 'COUPON_INVALID'; end if;
  select * into existing from public.coupons where id=p_id for update;
  c:=jsonb_populate_record(null::public.coupons,p_values);
  c.id:=p_id; c.code:=upper(trim(c.code)); c.name:=trim(c.name);
  c.minimum_order_amount:=coalesce(c.minimum_order_amount,0);
  c.is_stackable:=coalesce(c.is_stackable,existing.is_stackable,false);
  c.is_alumni:=coalesce(c.is_alumni,existing.is_alumni,false);
  c.exclude_free:=coalesce(c.exclude_free,true); c.is_active:=coalesce(c.is_active,true); c.is_draft:=coalesce(c.is_draft,false);
  c.product_scope:=coalesce(c.product_scope,'paid'); c.issue_target:=coalesce(c.issue_target,'all');
  if c.issue_target<>'tag' then c.target_tag_id:=null; end if;
  if c.discount_type='ADMIN_FREE' then c.is_stackable:=false; c.discount_value:=100; c.max_discount_amount:=null; c.exclude_free:=true; end if;
  if c.name is null or length(c.name) not between 1 and 100 or c.code is null or c.code !~ '^[A-Z0-9_-]{3,30}$'
    or c.discount_type is null or c.discount_value is null or length(coalesce(c.description,''))>2000
    or (c.product_scope='specific' and coalesce(cardinality(p_products),0)=0)
    or exists(select 1 from unnest(p_products) requested(product_id) where not exists(select 1 from public.courses course where course.id=requested.product_id and course.status<>'archived' and to_jsonb(course)->>'archived_at' is null))
  then raise exception 'COUPON_INVALID'; end if;
  insert into public.coupons(id,name,description,code,discount_type,discount_value,max_discount_amount,minimum_order_amount,usage_limit,per_user_limit,product_scope,issue_target,target_tag_id,exclude_free,starts_at,ends_at,issue_start_at,issue_end_at,is_active,is_draft,is_alumni,is_stackable,created_by)
  values(c.id,c.name,c.description,c.code,c.discount_type,c.discount_value,c.max_discount_amount,c.minimum_order_amount,c.usage_limit,c.per_user_limit,c.product_scope,c.issue_target,c.target_tag_id,c.exclude_free,c.starts_at,c.ends_at,c.issue_start_at,c.issue_end_at,c.is_active,c.is_draft,c.is_alumni,c.is_stackable,p_actor)
  on conflict(id) do update set name=excluded.name,description=excluded.description,code=excluded.code,discount_type=excluded.discount_type,discount_value=excluded.discount_value,max_discount_amount=excluded.max_discount_amount,minimum_order_amount=excluded.minimum_order_amount,usage_limit=excluded.usage_limit,per_user_limit=excluded.per_user_limit,product_scope=excluded.product_scope,issue_target=excluded.issue_target,target_tag_id=excluded.target_tag_id,exclude_free=excluded.exclude_free,starts_at=excluded.starts_at,ends_at=excluded.ends_at,issue_start_at=excluded.issue_start_at,issue_end_at=excluded.issue_end_at,is_active=excluded.is_active,is_draft=excluded.is_draft,is_alumni=excluded.is_alumni,is_stackable=excluded.is_stackable,updated_at=now()
  returning * into c;
  delete from public.coupon_products where coupon_id=c.id;
  if c.product_scope='specific' then
    insert into public.coupon_products(coupon_id,course_id) select c.id,id from (select distinct unnest(p_products) id) ids;
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'coupon.saved','coupon',c.id::text,to_jsonb(existing),to_jsonb(c));
  return to_jsonb(c);
end; $$;


revoke all on function public.edu_save_coupon(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.edu_save_coupon(uuid,uuid,jsonb,uuid[]) to service_role;

-- Lock in a stable order before checking policy or computing allocations.
-- Ordinary coupons remain mutually exclusive, except the existing awarded event pair.
create or replace function public.edu_event_quote(p_user uuid,p_cohort uuid,p_code text,p_order uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare codes text[]; legacy text[]; ordinary text[]; c text; q jsonb; lines jsonb:='[]';
 base integer; remaining integer; discount integer; first_id uuid;
begin
 codes:=case when nullif(trim(p_code),'') is null then array[]::text[] else string_to_array(upper(trim(p_code)),'+') end;
 if cardinality(codes)>10 or exists(select 1 from unnest(codes) x where x !~ '^[A-Z0-9_-]{3,30}$')
 or cardinality(codes)<>(select count(distinct x) from unnest(codes) x) then raise exception 'COUPON_INVALID'; end if;
 perform 1 from public.coupons where code=any(codes) order by id for update;
 if cardinality(codes)>1 then
   if exists(select 1 from public.coupons where code=any(codes) and discount_type='ADMIN_FREE') then raise exception 'COUPON_STACK_NOT_ALLOWED'; end if;
   select array[l.code,b.code] into legacy from public.edu_event_zones z
   join public.coupons l on l.id=z.live_coupon_id join public.coupons b on b.id=z.bonus_coupon_id
   join public.edu_event_awards a on a.zone_id=z.id and a.user_id=p_user
   where z.cohort_id=p_cohort and l.code=any(codes) and b.code=any(codes) order by z.id limit 1;
   ordinary:=array(select code from public.coupons where code=any(codes) and not is_stackable);
   if cardinality(ordinary)>1 and (legacy is null or not ordinary <@ legacy) then raise exception 'COUPON_STACK_NOT_ALLOWED'; end if;
   -- Apply the base coupon first, preserve live-before-bonus priority, then add extras.
   codes:=array(select x from unnest(codes) x left join public.coupons cp on cp.code=x
     order by case when x=legacy[1] then 0 when x=legacy[2] then 1 when not cp.is_stackable then 2 else 3 end,x);
 end if;
 q:=public.edu_coupon_quote(p_user,p_cohort,null,p_order);
 base:=(q->>'originalAmount')::integer; remaining:=base;
 foreach c in array codes loop
   q:=public.edu_coupon_quote(p_user,p_cohort,c,p_order);
   discount:=least(remaining,(q->>'couponDiscount')::integer);
   if discount=0 then continue;end if;
   if first_id is null then first_id:=(q->>'couponId')::uuid;end if;
   remaining:=remaining-discount;
   lines:=lines||jsonb_build_array(q||jsonb_build_object('couponDiscount',discount,'totalAmount',remaining));
 end loop;
 codes:=array(select value->>'couponCode' from jsonb_array_elements(lines));
 return jsonb_build_object('couponId',first_id,'couponCode',nullif(array_to_string(codes,'+'),''),
 'couponName',case when cardinality(codes)>1 then '쿠폰 중복 할인' else lines->0->>'couponName' end,
 'coupons',lines,'couponDiscount',base-remaining,'originalAmount',base,'totalAmount',remaining);
end; $$;
revoke all on function public.edu_event_quote(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.edu_event_quote(uuid,uuid,text,uuid) to service_role;
commit;
