'use client';
import { useEffect, useRef, useState } from 'react';
import { OptionalConsent } from './optional-consent';
import { consentReceipt, emptyConsent, OPTIONAL_CONSENT_VERSION, validateConsentChoices, type ConsentChoices, type ConsentSnapshot } from '@/lib/optional-consent';
import styles from './optional-consent.module.css';
async function readSettings(signal?: AbortSignal): Promise<ConsentSnapshot> {
  const response = await fetch('/api/account/marketing-consent', { cache: 'no-store', signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '수신 설정을 불러오지 못했어요.');
  return body;
}
type Attempt = { requestId: string; expectedRevision: string | null; choices: ConsentChoices };
export function ConsentSettings() {
  const [saved, setSaved] = useState<ConsentSnapshot | null>(null);
  const [choice, setChoice] = useState<ConsentChoices | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [receipt, setReceipt] = useState('');
  const attempt = useRef<Attempt | null>(null), working = useRef(false);
  async function load(signal?: AbortSignal) {
    try {
      const body = await readSettings(signal);
      if (signal?.aborted) return;
      setSaved(body); setChoice(body.choices); attempt.current = null; setReceipt(''); setError(''); setRetryable(false);
    } catch { if (!signal?.aborted) setError('수신 설정을 불러오지 못했어요. 다시 불러와 주세요.'); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void readSettings(controller.signal).then(body => {
      if (!controller.signal.aborted) { setSaved(body); setChoice(body.choices); }
    }).catch(() => { if (!controller.signal.aborted) setError('수신 설정을 불러오지 못했어요. 다시 불러와 주세요.'); });
    return () => controller.abort();
  }, []);
  async function save(next: ConsentChoices, retry = false) {
    if (working.current || !saved) return;
    setChoice(next); setReceipt(''); setError(''); setRetryable(false);
    if (!retry) attempt.current = null;
    if (!validateConsentChoices(next)) { setError('광고 소식을 받으려면 내 정보 사용에도 동의해 주세요.'); return; }
    if (!retry) attempt.current = { requestId: crypto.randomUUID(), expectedRevision: saved.revision, choices: next };
    working.current = true; setBusy(true);
    try {
      const response = await fetch('/api/account/marketing-consent', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...attempt.current, surface: 'profile', wordingVersion: OPTIONAL_CONSENT_VERSION }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '저장하지 못했어요. 다시 저장해 주세요.');
      setSaved(body); setChoice(body.choices); setReceipt(consentReceipt(body)); attempt.current = null; setRetryable(false);
    } catch (cause) { setRetryable(true); setError(cause instanceof Error ? cause.message : '저장 결과를 확인하지 못했어요. 다시 저장해 주세요.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <section id="consent-settings" className="panel mt32" aria-label="소식 수신 설정"><div className="panel-head"><h2>소식 수신 설정</h2></div><div className="panel-body stack">
    <p className={styles.help}>체크하면 저장돼요. 체크를 해제하면 해당 소식을 받지 않도록 바로 저장돼요. 결제·수업 안내는 계속 받을 수 있어요.</p>
    {saved?.legacyActive && <div className={styles.help}><p>이전에 신청한 혜택 소식은 유지되고 있어요. 아래에서 새로 선택하면 새 설정으로 바뀌어요.</p><button type="button" className="btn ghost" disabled={busy} onClick={() => void save({ ...emptyConsent })}>이전 혜택 소식 받기 취소</button></div>}
    {saved?.legacyRetired && !saved.revision && <p className={styles.help}>수신 동의 방식이 바뀌었어요. 소식을 계속 받으려면 아래에서 다시 골라 주세요.</p>}
    {choice ? <OptionalConsent value={choice} onChange={next => void save(next)} disabled={busy} dates={saved?.dates}/> : !error && <p role="status">수신 설정을 불러오는 중이에요.</p>}
    {busy && <p role="status">저장 중이에요.</p>}
    {receipt && <p className={styles.status} role="status">{receipt}</p>}
    {error && <><p className={`${styles.status} ${styles.error}`} role="alert">{error}</p><div className={styles.actions}>{choice && retryable && <button type="button" className="btn primary" disabled={busy} onClick={() => void save(choice, true)}>다시 저장하기</button>}<button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>저장된 설정 다시 불러오기</button></div></>}
  </div></section>;
}
