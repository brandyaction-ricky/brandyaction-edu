'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { ArrowRight, Check, CircleAlert } from 'lucide-react';
import { matchingOrder } from '@/lib/platform-rules';
import type { Row } from '@/lib/platform';

export function OrderResult({ data, refresh }: { data: Record<string, Row[]>; refresh: () => Promise<void> }) {
  const params = useSearchParams();
  const path = usePathname();
  const orderId = params.get('orderId') || params.get('order');
  const paymentKey = params.get('paymentKey');
  const amount = params.get('amount');
  const [state, setState] = useState<'checking' | 'paid' | 'error'>('checking');
  const [error, setError] = useState('');
  const order = matchingOrder(data.orders || [], orderId);
  const failed = path === '/payment/fail';
  const complete = !failed && (state === 'paid' || order?.status === 'paid');

  const confirm = useCallback(async () => {
    if (!paymentKey || !orderId || failed) return;
    setState('checking');
    try {
      const response = await fetch('/api/platform/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setState('paid');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '결제 결과를 확인하지 못했습니다.');
      setState('error');
    }
  }, [paymentKey, orderId, failed, amount, refresh, setState, setError]);

  useEffect(() => { const timer = setTimeout(() => void confirm(), 0); return () => clearTimeout(timer); }, [confirm]);
  const title = complete ? (order?.total_amount === 0 ? '무료 클래스 신청이 완료되었습니다.' : '결제가 완료되었습니다.')
    : failed ? '결제가 완료되지 않았습니다.'
    : state === 'error' ? '결제 결과를 다시 확인해 주세요.'
    : paymentKey ? '결제 결과를 확인하고 있습니다.' : '신청 내역을 확인해 주세요.';

  return <div className="wrap result-wrap">
    <div className="result-icon">{complete ? <Check /> : <CircleAlert />}</div>
    <h1>{title}</h1>
    <p role={state === 'error' ? 'alert' : 'status'}>{state === 'error' ? error : failed ? (params.get('message') || '신청 내역을 확인하고 다시 진행해 주세요.') : complete ? '마이페이지에서 신청한 클래스와 자료를 확인하세요.' : '확인된 주문에 한해 수강권이 제공됩니다.'}</p>
    <div className="flex gap8">
      {state === 'error' && paymentKey && <button className="btn" onClick={() => void confirm()}>결제 결과 다시 확인</button>}
      <Link className="btn primary" href={complete ? '/my/classes' : '/my/orders'}>{complete ? '내 클래스 보기' : '신청 내역 확인'}<ArrowRight /></Link>
      <Link className="btn" href="/classes">클래스 둘러보기</Link>
    </div>
  </div>;
}
