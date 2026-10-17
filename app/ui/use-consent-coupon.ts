'use client';

import { useEffect, useRef, useState } from 'react';
import type { RewardPayload, RewardSnapshot } from '@/lib/consent-reward';
import { OPTIONAL_CONSENT_VERSION } from '@/lib/optional-consent';

const endpoint = '/api/account/consent-reward';
type Attempt = { requestId: string; payload: RewardPayload };

/** The existing transaction grants Kakao consent and one coupon, without AI consent. */
export function useConsentCoupon(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const working = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (response.ok && !controller.signal.aborted) {
        const body = await response.json();
        if (!controller.signal.aborted) setSnapshot(body);
      }
    }).catch(() => { /* Coupon availability never blocks required signup or withdrawal. */ });
    return () => controller.abort();
  }, [enabled]);

  async function claim(marketingRevision: string | null): Promise<boolean> {
    if (working.current || conflict) return false;
    if (snapshot?.awarded) return true;
    if (!enabled || !snapshot?.available) return false;
    if (!attempt.current) attempt.current = {
      requestId: crypto.randomUUID(),
      payload: {
        choices: { analysis: false, overseas: false, kakao: true },
        personalRevision: snapshot.personalRevision, marketingRevision,
        wordingVersion: snapshot.terms?.version ?? null,
        marketingVersion: OPTIONAL_CONSENT_VERSION,
      },
    };
    working.current = true; setPending(true); setUnresolved(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current) });
      const body = await response.json();
      if (!response.ok) {
        if ([400, 403, 409].includes(response.status)) setConflict(true);
        throw new Error(body.error || '쿠폰 발급을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.');
      }
      if (body.awarded !== true) throw new Error('쿠폰 발급을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.');
      setSnapshot({ ...snapshot, awarded: true, handled: true });
      attempt.current = null; setUnresolved(false);
      return true;
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : '쿠폰 발급 결과를 확인하지 못했어요. 다시 확인해 주세요.');
      return false;
    } finally { working.current = false; setPending(false); }
  }

  function resetAttempt() {
    attempt.current = null; setUnresolved(false); setConflict(false); setError('');
  }
  return { snapshot, pending, unresolved, conflict, error, claim, resetAttempt };
}
