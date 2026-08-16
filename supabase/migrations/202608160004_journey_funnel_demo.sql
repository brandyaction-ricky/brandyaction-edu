begin;

-- Existing DEV journey fixtures stop at the application CTA. Extend a few of
-- those isolated sessions so every funnel state can be visually verified.
insert into public.customer_journey_events (session_id,event_name,path,target_path,element_label,metadata,occurred_at)
select session_id,'checkout_view','/checkout?course=brandyaction-practical',null,null,'{}'::jsonb,occurred_at + interval '3 minutes'
from public.customer_journey_events source
where source.session_id='dev-journey-article-01' and source.event_name='application_click'
  and not exists (select 1 from public.customer_journey_events target where target.session_id=source.session_id and target.event_name='checkout_view');

insert into public.customer_journey_events (session_id,event_name,path,target_path,element_label,metadata,occurred_at)
select session_id,'order_complete','/order-complete',null,null,'{}'::jsonb,occurred_at + interval '7 minutes'
from public.customer_journey_events source
where source.session_id='dev-journey-article-01' and source.event_name='application_click'
  and not exists (select 1 from public.customer_journey_events target where target.session_id=source.session_id and target.event_name='order_complete');

insert into public.customer_journey_events (session_id,event_name,path,target_path,element_label,metadata,occurred_at)
select session_id,'checkout_view','/checkout?course=brandyaction-practical',null,null,'{}'::jsonb,occurred_at + interval '2 minutes'
from public.customer_journey_events source
where source.session_id='dev-journey-direct-01' and source.event_name='application_click'
  and not exists (select 1 from public.customer_journey_events target where target.session_id=source.session_id and target.event_name='checkout_view');

insert into public.customer_journey_events (session_id,event_name,path,target_path,element_label,metadata,occurred_at)
select session_id,'order_complete','/order-complete',null,null,'{}'::jsonb,occurred_at + interval '5 minutes'
from public.customer_journey_events source
where source.session_id='dev-journey-direct-01' and source.event_name='application_click'
  and not exists (select 1 from public.customer_journey_events target where target.session_id=source.session_id and target.event_name='order_complete');

insert into public.customer_journey_events (session_id,event_name,path,target_path,element_label,metadata,occurred_at)
select session_id,'checkout_view','/checkout?course=content-conversion-lab',null,null,'{}'::jsonb,occurred_at + interval '4 minutes'
from public.customer_journey_events source
where source.session_id='dev-journey-blog-01' and source.event_name='application_click'
  and not exists (select 1 from public.customer_journey_events target where target.session_id=source.session_id and target.event_name='checkout_view');

commit;
