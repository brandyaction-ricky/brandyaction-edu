'use client';
import { useEffect, useRef, useState } from 'react';
import { OptionalConsent } from './optional-consent';
import { useConsentCoupon } from './use-consent-coupon';
import { ConsentCouponNotice } from './consent-coupon-notice';
import { MetaPurchaseOption } from './meta-purchase-option';
import { useMetaPurchaseConsent } from './use-meta-purchase-consent';
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
  const coupon = useConsentCoupon(process.env.NEXT_PUBLIC_EDU_CONSENT_REWARD_ENABLED === 'true');
  const meta = useMetaPurchaseConsent(true, 'profile');
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
      coupon.resetAttempt();
    } catch { if (!signal?.aborted) setError('수신 설정을 불러오지 못했어요. 다시 불러와 주세요.'); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void readSettings(controller.signal).then(body => {
      if (!controller.signal.aborted) { setSaved(body); setChoice(body.choices); }
    }).catch(() => { if (!controller.signal.aborted) setError('수신 설정을 불러오지 못했어요. 다시 불러와 주세요.'); });
    return () => controller.abort();
  }, []);
  async function claimCoupon(revision: string | null) {
    const claimed = await coupon.claim(revision);
    // Even a lost reward response may have advanced the marketing revision.
    // Read it before allowing withdrawal; do not replay a grant to withdraw it.
    try { const body = await readSettings(); setSaved(body); setChoice(body.choices); }
    catch { if (claimed) setError('쿠폰은 발급됐어요. 수신 설정을 변경하기 전에 저장된 설정을 다시 불러와 주세요.'); }
  }
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
      coupon.resetAttempt();
      if (next.marketingUse && next.kakao && coupon.snapshot?.available && !coupon.snapshot.awarded) await claimCoupon(body.revision);
    } catch (cause) { setRetryable(true); setError(cause instanceof Error ? cause.message : '저장 결과를 확인하지 못했어요. 다시 저장해 주세요.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <section id="consent-settings" className="panel mt32" aria-label="선택 동의 관리"><div className="panel-head"><h2>선택 동의 관리</h2></div><div className="panel-body stack">
    <p className={styles.help}>가입할 때 저장한 선택을 여기서 확인하고 변경할 수 있어요. 다시 동의할 필요는 없어요. 체크를 바꾸면 바로 저장되며, 해제하면 해당 소식을 받지 않아요.</p>
    {saved?.legacyActive && <div className={styles.help}><p>이전에 신청한 혜택 소식은 유지되고 있어요. 아래에서 새로 선택하면 새 설정으로 바뀌어요.</p><button type="button" className="btn ghost" disabled={busy} onClick={() => void save({ ...emptyConsent })}>이전 혜택 소식 받기 취소</button></div>}
    {choice ? <OptionalConsent value={choice} onChange={next => void save(next)} disabled={busy || coupon.pending} dates={saved?.dates}>
      <MetaPurchaseOption state={meta} immediate/>
      <ConsentCouponNotice snapshot={coupon.snapshot}/>
      {choice.marketingUse && choice.kakao && coupon.snapshot?.available && !coupon.snapshot.awarded && <button type="button" className="btn primary" disabled={busy || coupon.pending || coupon.conflict} onClick={() => void claimCoupon(saved!.revision)}>{coupon.pending ? '발급 확인 중…' : coupon.unresolved ? '쿠폰 발급 다시 확인하기' : '1만원 쿠폰 받기'}</button>}
      {coupon.error && <p role="alert" className={styles.error}>{coupon.error} 소식 수신은 위에서 변경할 수 있어요.</p>}
    </OptionalConsent> : !error && <p role="status">수신 설정을 불러오는 중이에요.</p>}
    {busy && <p role="status">저장 중이에요.</p>}
    {receipt && <p className={styles.status} role="status">{receipt}</p>}
    {error && <><p className={`${styles.status} ${styles.error}`} role="alert">{error}</p><div className={styles.actions}>{choice && retryable && <button type="button" className="btn primary" disabled={busy} onClick={() => void save(choice, true)}>다시 저장하기</button>}<button type="button" className="btn ghost" disabled={busy} onClick={() => void load()}>저장된 설정 다시 불러오기</button></div></>}
  </div></section>;
}
