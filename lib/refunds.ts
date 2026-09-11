import { createAdminClient } from '@/lib/supabase/admin';
import { uuid } from '@/lib/edu-workflows';

type Body = Record<string, unknown>;
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function processRefund(actor: string, body: Body) {
  if (!uuid(body.paymentId) || !uuid(body.requestId) || !Number.isSafeInteger(body.amount) || Number(body.amount) < 1 || typeof body.reason !== 'string' || body.reason.trim().length < 2 || body.reason.trim().length > 200)
    return reply({ error: '환불 금액과 사유(2~200자)를 확인해 주세요.' }, 400);
  const secret = process.env.TOSS_SECRET_KEY || process.env.PG_SECRET_KEY;
  if (!secret || (!secret.startsWith('test_') && process.env.EDU_ALLOW_LIVE_REFUNDS !== 'true'))
    return reply({ error: '실결제 환불은 서버 승인 설정이 필요합니다. 테스트 키 또는 운영 환불 승인 설정을 확인해 주세요.' }, 503);
  const db = createAdminClient();
  const { data: payment, error } = await db.from('payments').select('id,order_id,provider,provider_payment_key,approved_amount,cancelled_amount').eq('id', body.paymentId).single();
  if (error || !payment?.provider_payment_key || payment.provider !== 'toss') return reply({ error: '토스 결제 내역을 확인해 주세요.' }, 409);
  const { data: order } = await db.from('orders').select('order_number').eq('id', payment.order_id).single();
  if (!order) return reply({ error: '주문을 확인해 주세요.' }, 409);
  const reason = body.reason.trim();
  const claim = await db.rpc('edu_claim_refund', { p_actor: actor, p_request: body.requestId, p_payment: body.paymentId, p_amount: body.amount, p_reason: reason });
  if (claim.error) return reply({ error: /[가-힣]/.test(claim.error.message) ? claim.error.message : '다른 환불이 처리 중입니다. 기존 요청을 확인해 주세요.' }, 409);
  if (claim.data.status === 'completed') return reply({ ok: true, message: '이미 완료된 환불입니다.' });
  if (claim.data.status === 'failed') return reply({ error: '종료된 요청입니다. 결제 상태를 확인한 뒤 새로 요청해 주세요.' }, 409);
  const marker = `[EDU:${body.requestId}] ${reason}`;
  const headers = { Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'), 'Content-Type': 'application/json', 'Idempotency-Key': 'edu-refund-' + body.requestId };
  const endpoint = 'https://api.tosspayments.com/v1/payments/' + encodeURIComponent(payment.provider_payment_key);
  const valid = (v: Body) => v.paymentKey === payment.provider_payment_key && v.orderId === order.order_number && v.totalAmount === payment.approved_amount && v.currency === 'KRW';
  const reconcile = async (value: Body) => {
    if (!valid(value) || !Array.isArray(value.cancels)) return false;
    const matches = value.cancels.filter(c => c.cancelReason === marker && c.cancelAmount === body.amount && c.cancelStatus === 'DONE' && typeof c.transactionKey === 'string' && c.transactionKey.length > 0);
    if (matches.length !== 1) return false;
    const finalized = await db.rpc('edu_complete_refund', { p_request: body.requestId, p_payload: value, p_cancel: matches[0] });
    return !finalized.error;
  };
  try {
    // Retries only read provider state. An ambiguous external write is never replayed.
    const check = await fetch(endpoint, { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!check.ok) throw new Error('provider unavailable');
    const current = await check.json();
    if (await reconcile(current)) return reply({ ok: true, message: '환불 완료를 확인했습니다.' });
    if (!claim.data.isNew) return reply({ error: '환불 결과 확인 중입니다. 잠시 후 결과 재확인을 눌러 주세요. 환불 요청은 중복 전송하지 않습니다.' }, 409);
    if (!valid(current) || !['DONE', 'PARTIAL_CANCELED'].includes(current.status) || current.balanceAmount !== payment.approved_amount - claim.data.baseline_cancelled || current.method === '가상계좌') {
      await db.from('edu_refund_requests').update({ status: 'failed' }).eq('id', body.requestId);
      return reply({ error: '환불 요청을 보내지 않았습니다. 결제 상태·잔액을 확인해 주세요. 가상계좌 환불은 결제사에서 처리해 주세요.' }, 409);
    }
    const response = await fetch(endpoint + '/cancel', { method: 'POST', headers, body: JSON.stringify({ cancelReason: marker, cancelAmount: body.amount }), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (response.ok && await reconcile(result)) return reply({ ok: true, message: '환불을 완료했습니다. 전액 환불 시 수강권도 회수됩니다.' });
    // A non-2xx response or DB failure can still follow an external cancellation.
    // Leave the durable request locked for read-only reconciliation.
  } catch { /* No provider payload, account details or secrets in application logs. */ }
  return reply({ error: '환불 결과를 확정하지 못했습니다. 주문의 결과 재확인으로 확인해 주세요. 새 환불은 차단되어 있습니다.' }, 503);
}
