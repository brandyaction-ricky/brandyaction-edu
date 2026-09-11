import { getAuthenticatedUser } from '@/lib/server-auth';
import { createAdminClient } from '@/lib/supabase/admin';
export async function POST(request: Request) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
        return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
    const user = await getAuthenticatedUser();
    if (!user)
        return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    try {
        const body = await request.json();
        if (typeof body.paymentKey !== 'string' || typeof body.orderId !== 'string' || !Number.isSafeInteger(body.amount))
            return Response.json({ error: '결제 정보를 확인해 주세요.' }, { status: 400 });
        const db = createAdminClient();
        const { data: order } = await db.from('orders').select('id,status,total_amount').eq('order_number', body.orderId).eq('user_id', user.id).single();
        if (!order || order.total_amount !== body.amount)
            return Response.json({ error: '주문 금액이 일치하지 않습니다.' }, { status: 409 });
        if (order.status === 'paid')
            return Response.json({ ok: true });
        if (!['pending', 'payment_failed'].includes(order.status))
            return Response.json({ error: '결제할 수 없는 주문입니다.' }, { status: 409 });
        const secret = process.env.TOSS_SECRET_KEY || process.env.PG_SECRET_KEY;
        if (!secret)
            return Response.json({ error: '결제 설정을 확인하고 있습니다.' }, { status: 503 });
        const headers = { 'Authorization': 'Basic ' + Buffer.from(secret + ':').toString('base64'), 'Content-Type': 'application/json', 'Idempotency-Key': 'edu-confirm-' + order.id };
        let response = await fetch('https://api.tosspayments.com/v1/payments/confirm', { method: 'POST', headers, body: JSON.stringify({ paymentKey: body.paymentKey, orderId: body.orderId, amount: order.total_amount }), signal: AbortSignal.timeout(15000) });
        let payment = await response.json();
        if (!response.ok && payment.code === 'ALREADY_PROCESSED_PAYMENT') {
            response = await fetch('https://api.tosspayments.com/v1/payments/' + encodeURIComponent(body.paymentKey), { headers, signal: AbortSignal.timeout(15000) });
            payment = await response.json();
        }
        if (!response.ok)
            return Response.json({ error: '결제를 승인하지 못했습니다. 주문 내역을 확인해 주세요.' }, { status: 409 });
        if (payment.orderId !== body.orderId || payment.totalAmount !== order.total_amount || payment.status !== 'DONE' || payment.currency !== 'KRW')
            return Response.json({ error: '결제 완료 상태를 확인할 수 없습니다.' }, { status: 409 });
        const { error } = await db.rpc('finalize_toss_payment', { p_order_number: payment.orderId, p_payment_key: payment.paymentKey, p_method: payment.method, p_approved_amount: payment.totalAmount, p_receipt_url: payment.receipt?.url || null, p_payload: payment, p_approved_at: payment.approvedAt });
        if (error) {
            console.error('payment finalization failed', error.code);
            return Response.json({ error: '결제 승인 후 수강권 확인 중입니다. 새로고침해 다시 확인해 주세요.' }, { status: 503 });
        }
        return Response.json({ ok: true });
    }
    catch {
        return Response.json({ error: '결제 결과 확인을 완료하지 못했습니다. 주문 내역을 확인해 주세요.' }, { status: 503 });
    }
}
