begin;
create table if not exists public.edu_refund_requests (
  id uuid primary key,
  payment_id uuid not null references public.payments(id),
  actor_id uuid not null references public.profiles(id),
  amount integer not null check(amount>0),
  reason text not null check(length(reason) between 2 and 200),
  baseline_cancelled integer not null,
  status text not null default 'processing' check(status in ('processing','completed','failed')),
  provider_refund_key text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists edu_one_pending_refund on public.edu_refund_requests(payment_id) where status='processing';
alter table public.edu_refund_requests enable row level security;
revoke all on public.edu_refund_requests from anon, authenticated;
grant all on public.edu_refund_requests to service_role;
create policy service_refunds on public.edu_refund_requests for all to service_role using(true) with check(true);

create or replace function public.edu_claim_refund(p_actor uuid,p_request uuid,p_payment uuid,p_amount integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payment public.payments%rowtype; previous public.edu_refund_requests%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active') then raise exception '관리자 권한이 필요합니다.'; end if;
 select * into payment from public.payments where id=p_payment for update;
 if not found then raise exception '결제 내역을 확인해 주세요.'; end if;
 select * into previous from public.edu_refund_requests where id=p_request;
 if found then
   if previous.payment_id<>p_payment or previous.amount<>p_amount or previous.reason<>p_reason then raise exception '기존 환불 요청과 내용이 다릅니다.'; end if;
   return to_jsonb(previous)||jsonb_build_object('isNew',false);
 end if;
 if p_amount<=0 or p_amount>payment.approved_amount-payment.cancelled_amount or p_request is null then raise exception '환불 가능 금액을 확인해 주세요.'; end if;
 if exists(select 1 from public.edu_refund_requests where payment_id=p_payment and status='processing') then raise exception '확인 중인 환불이 있습니다. 해당 요청의 결과를 먼저 확인해 주세요.'; end if;
 insert into public.edu_refund_requests(id,payment_id,actor_id,amount,reason,baseline_cancelled)
 values(p_request,p_payment,p_actor,p_amount,p_reason,payment.cancelled_amount) returning * into previous;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'refund.requested','payment',p_payment::text,jsonb_build_object('request_id',p_request,'amount',p_amount,'reason',p_reason));
 return to_jsonb(previous)||jsonb_build_object('isNew',true);
end; $$;

create or replace function public.edu_complete_refund(p_request uuid,p_payload jsonb,p_cancel jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare request public.edu_refund_requests%rowtype; payment public.payments%rowtype; order_number text;
begin
 select * into request from public.edu_refund_requests where id=p_request for update;
 if not found then raise exception '환불 요청이 없습니다.'; end if;
 if request.status='completed' then return; end if;
 select * into payment from public.payments where id=request.payment_id for update;
 select o.order_number into order_number from public.orders o where o.id=payment.order_id;
 if request.status<>'processing' or p_payload->>'paymentKey' is distinct from payment.provider_payment_key
   or p_payload->>'orderId' is distinct from order_number or p_payload->>'currency' is distinct from 'KRW'
   or (p_payload->>'totalAmount')::integer is distinct from payment.approved_amount
   or (p_cancel->>'cancelAmount')::integer is distinct from request.amount
   or p_cancel->>'cancelStatus' is distinct from 'DONE'
   or nullif(p_cancel->>'transactionKey','') is null
   or p_cancel->>'cancelReason' is distinct from ('[EDU:'||p_request::text||'] '||request.reason)
   or not (p_payload->'cancels' @> jsonb_build_array(p_cancel))
   or payment.cancelled_amount<>request.baseline_cancelled
   or (p_payload->>'balanceAmount')::integer is distinct from (payment.approved_amount-request.baseline_cancelled-request.amount)
 then raise exception '결제사 결과와 내부 내역을 대조해야 합니다.'; end if;
 perform public.finalize_toss_refund(order_number,request.amount,request.reason,p_cancel->>'transactionKey',jsonb_build_object('request_id',p_request,'transactionKey',p_cancel->>'transactionKey'));
 -- Existing finalizer supports one item; revoke every associated enrollment on full refund.
 if (p_payload->>'balanceAmount')::integer=0 then
   update public.enrollments set status='refunded',revoked_at=now()
   where order_item_id in (select id from public.order_items where order_id=payment.order_id);
 end if;
 update public.edu_refund_requests set status='completed',provider_refund_key=p_cancel->>'transactionKey',completed_at=now() where id=p_request;
end; $$;
revoke all on function public.edu_claim_refund(uuid,uuid,uuid,integer,text),public.edu_complete_refund(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.edu_claim_refund(uuid,uuid,uuid,integer,text),public.edu_complete_refund(uuid,jsonb,jsonb) to service_role;
commit;
