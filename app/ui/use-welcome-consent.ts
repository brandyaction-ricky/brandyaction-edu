'use client';
import { useEffect, useRef, useState } from 'react';
import { WELCOME_CONSENT_COPY, welcomeChoices, noWelcomeChoices, type WelcomeRequest, type WelcomeSnapshot, type WelcomeChoices, type ConsentScope } from '@/lib/welcome-consent';
const endpoint = '/api/account/welcome-consent';
export function useWelcomeConsent(enabled = true) {
  const [snapshot,setSnapshot] = useState<WelcomeSnapshot | null>(null), [choices,setChoices] = useState<WelcomeChoices>({...noWelcomeChoices});
  const [unresolved,setUnresolved]=useState(false);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const attempt = useRef<WelcomeRequest | null>(null), working = useRef(false);
  const accept = (s: WelcomeSnapshot) => { setSnapshot(s); setChoices(welcomeChoices(s)); attempt.current = null; setUnresolved(false); setError(''); };
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async r => { if (!r.ok) throw Error(); const s = await r.json(); if (!controller.signal.aborted) accept(s); }).catch(() => { if (!controller.signal.aborted) setError('설정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'); });
    return () => controller.abort();
  },[enabled]);
  async function reload() {
    if (working.current) return;
    working.current=true; setBusy(true); try { const r=await fetch(endpoint,{cache:'no-store'}); if(!r.ok) throw Error(); accept(await r.json()); setNotice(''); }
    catch { setError('설정을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'); } finally { working.current=false; setBusy(false); }
  }
  async function save(scope: ConsentScope, next: WelcomeChoices, retry = false) {
    if (working.current || !snapshot) return false;
    if (!retry) attempt.current = { requestId:crypto.randomUUID(),copyVersion:WELCOME_CONSENT_COPY,scope,choices:next,
      expected:{marketing:snapshot.marketing.revision,personal:snapshot.personal.revision,meta:snapshot.meta.revision},
      versions:{personal:snapshot.personal.terms?.version ?? null,meta:snapshot.meta.terms?.version ?? null} };
    if (!attempt.current) return false;
    setUnresolved(true);
    working.current=true; setBusy(true); setError(''); setNotice('');
    try {
      const r=await fetch(endpoint,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(attempt.current)}), s=await r.json();
      if(!r.ok) { if(r.status===409 || r.status===400 || r.status===403){attempt.current=null;setUnresolved(false);} throw Error(s.error || '저장하지 못했어요. 같은 선택으로 다시 확인해 주세요.'); }
      accept(s); setNotice(s.reward.awarded && !snapshot.reward.awarded ? '1만원 쿠폰을 발급받았어요. 내 쿠폰에서 확인해 주세요.' : scope === 'dismiss' ? '다시 묻지 않을게요. 회원 정보에서 언제든 선택할 수 있어요.' : '선택한 항목을 저장했어요. 회원 정보에서 언제든 바꿀 수 있어요.');
      return true;
    } catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : '저장 결과를 확인하지 못했어요. 같은 선택으로 다시 확인해 주세요.'); return false; }
    finally { working.current=false; setBusy(false); }
  }
  return { snapshot, choices, setChoices, busy, error, notice, save, reload, retry: () => attempt.current ? save(attempt.current.scope,attempt.current.choices,true) : Promise.resolve(false), unresolved };
}
