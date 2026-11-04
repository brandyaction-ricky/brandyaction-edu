-- A learning item observed after consent/capture may occur on that same KST date.
-- With the cohort candidate OFF the existing date-boundary policy is unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare fn regprocedure; definition text;
 marker text := $old$(d.date_kst::timestamp at time zone 'Asia/Seoul')>=greatest(s.created_at,(select capture_since from edu_tips_private.feed_state))$old$;
 replacement text := $new$(
   (not exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled)
     and (d.date_kst::timestamp at time zone 'Asia/Seoul')>=greatest(s.created_at,(select capture_since from edu_tips_private.feed_state)))
   or (exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled)
     and d.observed_at>=greatest(s.created_at,(select capture_since from edu_tips_private.feed_state))
     and d.observed_at<=clock_timestamp()
     and d.date_kst=(d.observed_at at time zone 'Asia/Seoul')::date)
  )$new$;
begin
 foreach fn in array array['edu_tips_private.capture_legacy_candidate(uuid)'::regprocedure,
                           'edu_tips_private.hmac_needed_refs(uuid)'::regprocedure] loop
  definition:=pg_get_functiondef(fn);
  if strpos(definition,marker)=0 or strpos(substr(definition,strpos(definition,marker)+length(marker)),marker)>0 then
   raise exception 'TIPS_LEARNING_CAPTURE_VERSION_MISMATCH';
  end if;
  execute replace(definition,marker,replacement);
 end loop;
end$$;
-- A later real use of the same item/day can replace an older observation after
-- a new consent generation. It never invents a new activity or changes item IDs.
do $$
declare definition text;
 marker text := $old$on conflict do nothing;
   end if;
  end if;
  if m is not null$old$;
begin
 definition:=pg_get_functiondef('edu_tips_private.capture_source()'::regprocedure);
 if strpos(definition,marker)=0 or strpos(substr(definition,strpos(definition,marker)+length(marker)),marker)>0 then
  raise exception 'TIPS_LEARNING_CAPTURE_TRIGGER_VERSION_MISMATCH';
 end if;
 execute replace(definition,marker,$new$on conflict(enrollment_id,date_kst,item_type,item_id) do update
     set observed_at=excluded.observed_at
     where exists(select 1 from edu_tips_private.cohort_refresh_settings where id=1 and enabled)
       and excluded.observed_at>edu_tips_private.learning_days.observed_at;
   end if;
  end if;
  if m is not null$new$);
end$$;
commit;
