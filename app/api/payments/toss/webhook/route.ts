import { createHash, timingSafeEqual } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 256 * 1024;
const TOSS_API = 'https://api.tosspayments.com/v1/payments';

type JsonObject = Record<string, unknown>;
type PaymentOperation = 'finalize_toss_payment' | 'record_toss_waiting_payment' | 'finalize_toss_refund' | 'record_toss_terminal_payment';

const PAYMENT_STATUSES = new Set(['READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE', 'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED']);
const DATABASE_REASONS = new Set([
  'ORDER_NOT_FOUND', 'ORDER_USER_MISSING', 'ORDER_NOT_PAYABLE', 'ORDER_ITEM_NOT_FOUND',
  'PAYMENT_NOT_FOUND', 'PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_KEY_ALREADY_USED',
  'ORDER_PAYMENT_KEY_MISMATCH', 'COHORT_NOT_FOUND', 'INVALID_REFUND_AMOUNT',
]);

const reply = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'private, no-store' },
});

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function databaseErrorMessage(error: unknown) {
  return object(error) && typeof error.message === 'string' ? error.message : '';
}

function orderNotFound(error: unknown) {
  return databaseErrorMessage(error) === 'ORDER_NOT_FOUND';
}

function databaseDiagnostic(
  operation: PaymentOperation | 'event_lookup' | 'event_recording' | 'unknown',
  payment: JsonObject,
  error: unknown,
) {
  const code = object(error) ? error.code : null;
  const reason = databaseErrorMessage(error);
  // Never log the provider payload, identifiers, free-form DB details or hints.
  return {
    operation,
    paymentStatus: typeof payment.status === 'string' && PAYMENT_STATUSES.has(payment.status) ? payment.status : 'UNKNOWN',
    databaseCode: typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : 'UNKNOWN',
    reason: DATABASE_REASONS.has(reason) ? reason : 'UNCLASSIFIED_DATABASE_ERROR',
  };
}

async function paymentRpc(db: ReturnType<typeof createAdminClient>, operation: PaymentOperation, args: JsonObject) {
  const result = await db.rpc(operation, args);
  return { ...result, operation };
}

function validToken(received: string | null, expected: string) {
  if (received === null) return false;
  const actualDigest = createHash('sha256').update(received).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function eventDetails(payload: JsonObject) {
  if (payload.eventType === 'PAYMENT_STATUS_CHANGED' && object(payload.data)) {
    return { type: 'PAYMENT_STATUS_CHANGED', hint: payload.data };
  }
  if (nonEmpty(payload.secret, 200) && nonEmpty(payload.status, 40) && nonEmpty(payload.orderId, 64)) {
    return { type: 'DEPOSIT_CALLBACK', hint: payload };
  }
  return null;
}

function tossHeaders(secret: string) {
  return { Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}` };
}

async function queryPayment(type: string, hint: JsonObject, secret: string) {
  let endpoint: string;
  if (type === 'PAYMENT_STATUS_CHANGED') {
    if (!nonEmpty(hint.paymentKey, 200)) throw new Error('INVALID_EVENT');
    endpoint = `${TOSS_API}/${encodeURIComponent(hint.paymentKey)}`;
  } else {
    if (!nonEmpty(hint.orderId, 64)) throw new Error('INVALID_EVENT');
    endpoint = `${TOSS_API}/orders/${encodeURIComponent(hint.orderId)}`;
  }
  const response = await fetch(endpoint, {
    headers: tossHeaders(secret),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('PROVIDER_UNAVAILABLE');
  const payment: unknown = await response.json();
  if (!object(payment)) throw new Error('INVALID_PROVIDER_RESPONSE');
  return payment;
}

function verifiedIdentity(type: string, hint: JsonObject, payment: JsonObject) {
  if (!nonEmpty(payment.paymentKey, 200) || !nonEmpty(payment.orderId, 64) || !nonEmpty(payment.status, 40)) return false;
  if (type === 'PAYMENT_STATUS_CHANGED' && payment.paymentKey !== hint.paymentKey) return false;
  if (type === 'DEPOSIT_CALLBACK' && payment.orderId !== hint.orderId) return false;
  return Number.isSafeInteger(payment.totalAmount) && Number(payment.totalAmount) >= 0 && payment.currency === 'KRW';
}

async function reconcilePayment(db: ReturnType<typeof createAdminClient>, payment: JsonObject) {
  const status = String(payment.status);
  const common = {
    p_order_number: payment.orderId,
    p_payment_key: payment.paymentKey,
    p_payload: payment,
  };

  if (status === 'DONE') {
    if (!nonEmpty(payment.method, 100) || !nonEmpty(payment.approvedAt, 100)) throw new Error('INVALID_PROVIDER_RESPONSE');
    return paymentRpc(db, 'finalize_toss_payment', {
      ...common,
      p_method: payment.method,
      p_approved_amount: payment.totalAmount,
      p_receipt_url: object(payment.receipt) && typeof payment.receipt.url === 'string' ? payment.receipt.url : null,
      p_approved_at: payment.approvedAt,
    });
  }

  if (status === 'WAITING_FOR_DEPOSIT') {
    return paymentRpc(db, 'record_toss_waiting_payment', {
      ...common,
      p_method: typeof payment.method === 'string' ? payment.method : null,
      p_amount: payment.totalAmount,
      p_receipt_url: object(payment.receipt) && typeof payment.receipt.url === 'string' ? payment.receipt.url : null,
      p_expires_at: object(payment.virtualAccount) && typeof payment.virtualAccount.dueDate === 'string' ? payment.virtualAccount.dueDate : null,
    });
  }

  if (status === 'PARTIAL_CANCELED' || status === 'CANCELED') {
    const cancellations = Array.isArray(payment.cancels) ? payment.cancels.filter(object) : [];
    const completed = cancellations.filter(cancel =>
      cancel.cancelStatus === 'DONE'
      && Number.isSafeInteger(cancel.cancelAmount)
      && Number(cancel.cancelAmount) > 0
      && nonEmpty(cancel.transactionKey, 64),
    );
    if (completed.length > 0) {
      for (const cancel of completed) {
        const result = await paymentRpc(db, 'finalize_toss_refund', {
          p_order_number: payment.orderId,
          p_amount: cancel.cancelAmount,
          p_reason: typeof cancel.cancelReason === 'string' && cancel.cancelReason ? cancel.cancelReason : '토스 결제 취소',
          p_refund_key: cancel.transactionKey,
          p_payload: {
            paymentKey: payment.paymentKey,
            orderId: payment.orderId,
            status: payment.status,
            cancel,
          },
        });
        if (result.error) return result;
      }
      return { error: null };
    }
    if (status === 'PARTIAL_CANCELED') throw new Error('INVALID_PROVIDER_RESPONSE');
  }

  if (['CANCELED', 'ABORTED', 'EXPIRED'].includes(status)) {
    const result = await paymentRpc(db, 'record_toss_terminal_payment', {
      ...common,
      p_status: status,
    });
    return { ...result, ignoreMissingOrder: true };
  }

  return { error: null, ignored: true };
}

async function recordedEvent(
  db: ReturnType<typeof createAdminClient>,
  providerEventId: string,
) {
  return db
    .from('payment_events')
    .select('processing_status')
    .eq('provider', 'toss')
    .eq('provider_event_id', providerEventId)
    .maybeSingle();
}

async function recordEvent(
  db: ReturnType<typeof createAdminClient>,
  providerEventId: string,
  eventType: string,
  payment: JsonObject,
  processingStatus: 'processed' | 'ignored',
  errorMessage: string | null = null,
) {
  return db.from('payment_events').upsert({
    provider: 'toss',
    provider_event_id: providerEventId,
    event_type: eventType,
    processing_status: processingStatus,
    payload: payment,
    error_message: errorMessage,
    processed_at: new Date().toISOString(),
  }, { onConflict: 'provider,provider_event_id' });
}

export async function POST(request: Request) {
  const webhookToken = process.env.TOSS_WEBHOOK_TOKEN;
  if (!webhookToken) return reply({ error: '웹훅 설정이 완료되지 않았습니다.' }, 503);
  const receivedToken = new URL(request.url).searchParams.get('token');
  const nextWebhookToken = process.env.TOSS_WEBHOOK_TOKEN_NEXT;
  if (!validToken(receivedToken, webhookToken)
    && (!nextWebhookToken || !validToken(receivedToken, nextWebhookToken))) {
    return reply({ error: '허용되지 않은 요청입니다.' }, 401);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() || '';
  if (!contentType.startsWith('application/json')) return reply({ error: 'JSON 요청만 허용됩니다.' }, 415);
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return reply({ error: '요청 본문이 너무 큽니다.' }, 413);

  let rawBody: string;
  let payload: unknown;
  try {
    rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return reply({ error: '요청 본문이 너무 큽니다.' }, 413);
    payload = JSON.parse(rawBody);
  } catch {
    return reply({ error: '웹훅 본문을 확인해 주세요.' }, 400);
  }
  if (!object(payload)) return reply({ error: '웹훅 본문을 확인해 주세요.' }, 400);

  const event = eventDetails(payload);
  if (!event) return reply({ ok: true, ignored: true });

  const secret = process.env.TOSS_SECRET_KEY || process.env.PG_SECRET_KEY;
  if (!secret) return reply({ error: '결제 조회 설정이 완료되지 않았습니다.' }, 503);

  try {
    const payment = await queryPayment(event.type, event.hint, secret);
    if (!verifiedIdentity(event.type, event.hint, payment)) return reply({ error: '결제 조회 결과가 일치하지 않습니다.' }, 409);

    const db = createAdminClient();
    const transmissionId = request.headers.get('tosspayments-webhook-transmission-id');
    const providerEventId = nonEmpty(transmissionId, 200)
      ? transmissionId
      : createHash('sha256').update(rawBody).digest('hex');
    const existing = await recordedEvent(db, providerEventId);
    if (existing.error) {
      console.error('toss webhook event lookup failed', databaseDiagnostic('event_lookup', payment, existing.error));
      return reply({ error: '결제 이벤트 기록을 확인하지 못했습니다.' }, 503);
    }
    if (existing.data?.processing_status === 'processed' || existing.data?.processing_status === 'ignored') {
      return reply({ ok: true, ignored: existing.data.processing_status === 'ignored', duplicate: true });
    }

    const result = await reconcilePayment(db, payment);
    if (result.error) {
      const ignoreMissingOrder = 'ignoreMissingOrder' in result && result.ignoreMissingOrder === true;
      if (ignoreMissingOrder && orderNotFound(result.error)) {
        const recorded = await recordEvent(db, providerEventId, event.type, payment, 'ignored', 'ORDER_NOT_FOUND');
        if (recorded.error) {
          console.error('toss webhook event recording failed', databaseDiagnostic('event_recording', payment, recorded.error));
          return reply({ error: '결제 이벤트 기록을 완료하지 못했습니다.' }, 503);
        }
        return reply({ ok: true, ignored: true });
      }
      console.error('toss webhook reconciliation failed', databaseDiagnostic('operation' in result ? result.operation : 'unknown', payment, result.error));
      return reply({ error: '결제 상태 반영을 완료하지 못했습니다.' }, 503);
    }
    const ignored = 'ignored' in result && Boolean(result.ignored);

    const recorded = await recordEvent(db, providerEventId, event.type, payment, ignored ? 'ignored' : 'processed');
    if (recorded.error) {
      console.error('toss webhook event recording failed', databaseDiagnostic('event_recording', payment, recorded.error));
      return reply({ error: '결제 이벤트 기록을 완료하지 못했습니다.' }, 503);
    }
    return reply({ ok: true, ignored });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_EVENT') return reply({ error: '웹훅 본문을 확인해 주세요.' }, 400);
    if (error instanceof Error && error.message === 'INVALID_PROVIDER_RESPONSE') return reply({ error: '결제 조회 결과를 확인할 수 없습니다.' }, 502);
    return reply({ error: '결제사 상태 조회를 완료하지 못했습니다.' }, 502);
  }
}
