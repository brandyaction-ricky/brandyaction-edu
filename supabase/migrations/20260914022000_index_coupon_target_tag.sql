create index if not exists coupons_target_tag_id_idx
  on public.coupons (target_tag_id)
  where target_tag_id is not null;
