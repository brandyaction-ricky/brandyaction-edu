'use client';
import { useEffect, useRef, useState } from 'react';
import type { MetaPurchaseRequest, MetaPurchaseSnapshot } from '@/lib/meta-purchase-consent';
const endpoint = '/api/account/meta-purchase-consent';
async function read(signal?: AbortSignal): Promise<MetaPurchaseSnapshot> {
  const response = await fetch(endpoint, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Meta 동의 설정을 불러오지 못했어요. 이 항목을 선택하지 않고도 가입·수강·쿠폰 혜택을 이용할 수 있어요.');
  return response.json();
}
export function useMetaPurchaseConsent(enabled: boolean, surface: MetaPurchaseRequest['surface']) {
  const [snapshot, setSnapshot] = useState<MetaPurchaseSnapshot | null>(null);
  const [value, setValue] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [unresolved, setUnresolved] = useState(false), [conflict, setConflict] = useState(false);
  const attempt = useRef<MetaPurchaseRequest | null>(null), working = useRef(false);
  function accept(body: MetaPurchaseSnapshot) {
    setSnapshot(body); setValue(body.consented && !body.needsRenewal);
    attempt.current = null; setError(''); setUnresolved(false); setConflict(false);
  }
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void read(controller.signal).then(body => { if (!controller.signal.aborted) accept(body); }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Meta 설정을 확인하지 못했어요.');
    });
    return () => controller.abort();
  }, [enabled]);
  async function reload() {
    if (working.current) return;
    working.current = true; setBusy(true); setNotice('');
    try { accept(await read()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Meta 설정을 확인하지 못했어요.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function save(next = value): Promise<boolean> {
    if (working.current) return false;
    if (!enabled || (!snapshot && !next)) return true;
    if (!snapshot) return false;
    if (conflict && attempt.current?.consented === next) return false;
    working.current = true; setBusy(true); setError(''); setNotice('');
    try {
      let current = snapshot;
      // A lost opt-in may have committed. A subsequent opt-out first observes
      // its revision, then explicitly revokes it instead of skipping the write.
      if (attempt.current && attempt.current.consented !== next) {
        current = await read(); attempt.current = null; setConflict(false);
      }
      if (!attempt.current && current.consented === next && (!next || !current.needsRenewal)) {
        accept(current); return true;
      }
      if (!attempt.current) attempt.current = {
        requestId: crypto.randomUUID(), expectedRevision: current.revision, consented: next,
        wordingVersion: next ? current.terms?.version ?? null : null, surface,
      };
      setUnresolved(true);
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current) });
      const body = await response.json();
      if (!response.ok) {
        if ([400, 403, 409].includes(response.status)) setConflict(true);
        throw new Error(body.error || 'Meta 동의를 저장하지 못했어요. 다시 확인해 주세요.');
      }
      accept(body); setNotice(next ? 'Meta 구매 전환 측정 동의를 저장했어요.' : 'Meta 구매 전환 측정 동의를 취소했어요.');
      return true;
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'Meta 동의 저장 결과를 확인하지 못했어요. 같은 선택으로 다시 확인해 주세요.');
      return false;
    } finally { working.current = false; setBusy(false); }
  }
  return { snapshot, value, setValue, busy, error, notice, unresolved, conflict, reload, save };
}
