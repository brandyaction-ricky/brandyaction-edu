'use client';
import { useEffect, useRef, useState } from 'react';
import { noPersonalization, type PersonalizationChoices, type PersonalizationSnapshot } from '@/lib/personalization-consent';
import styles from './personalization-settings.module.css';
type Attempt = { requestId: string; expectedRevision: string | null; wordingVersion: string | null; choices: PersonalizationChoices };
const endpoint = '/api/account/personalization-consent';
export function PersonalizationSettings() {
  const [snapshot, setSnapshot] = useState<PersonalizationSnapshot | null>(null);
  const [choices, setChoices] = useState<PersonalizationChoices>(noPersonalization);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [retryable, setRetryable] = useState(false);
  const attempt = useRef<Attempt | null>(null), working = useRef(false);
  function accept(body: PersonalizationSnapshot) {
    setSnapshot(body); setChoices(body.needsRenewal ? { ...noPersonalization } : body.choices);
    attempt.current = null; setError(''); setRetryable(false);
  }
  async function reload() {
    if (working.current) return;
    working.current = true; setBusy(true);
    try { const response = await fetch(endpoint, { cache: 'no-store' }); if (!response.ok) throw Error(); accept(await response.json()); setNotice(''); }
    catch { setError('설정을 불러오지 못했어요. 수강은 그대로 이용할 수 있어요.'); }
    finally { working.current = false; setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error(); const body = await response.json();
      if (!controller.signal.aborted) accept(body);
    }).catch(() => { if (!controller.signal.aborted) setError('설정을 불러오지 못했어요. 수강은 그대로 이용할 수 있어요.'); });
    return () => controller.abort();
  }, []);
  async function save(next: PersonalizationChoices, retry = false) {
    if (working.current || !snapshot) return;
    if (!retry) attempt.current = { requestId: crypto.randomUUID(), expectedRevision: snapshot.revision, wordingVersion: snapshot.terms?.version ?? null, choices: next };
    if (!attempt.current) return;
    working.current = true; setBusy(true); setError(''); setNotice(''); setRetryable(false);
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current) });
      const body = await response.json();
      if (!response.ok) { setRetryable(response.status !== 409 && response.status !== 400); throw Error(body.error || '저장하지 못했어요. 다시 시도해 주세요.'); }
      accept(body); setOpen(false);
      setNotice(next.analysis || next.overseas ? '선택한 내용을 저장했어요. 광고 수신 설정은 바뀌지 않았어요.' : '분석·국외 이전 동의를 모두 취소했어요. 수강과 광고 수신 설정은 바뀌지 않았어요.');
    } catch (cause) {
      if (cause instanceof TypeError) setRetryable(true);
      setError(cause instanceof Error ? cause.message : '저장 결과를 확인하지 못했어요. 다시 시도해 주세요.');
    } finally { working.current = false; setBusy(false); }
  }
  const hasConsent = snapshot && (snapshot.choices.analysis || snapshot.choices.overseas);
  const summary = !snapshot ? '확인 중' : snapshot.needsRenewal ? '안내 확인 필요' : snapshot.eligible ? '사용 중' : hasConsent ? '동의 내역 있음' : '사용 안 함';
  const unchanged = snapshot && !snapshot.needsRenewal && choices.analysis === snapshot.choices.analysis && choices.overseas === snapshot.choices.overseas;
  if ((!snapshot && !error) || (snapshot && !snapshot.accepting && !hasConsent && !notice && !error)) return null;
  return <section id="personalization-settings" className={styles.card} aria-labelledby="personalization-title">
    <div className={styles.header}><div><span className={styles.eyebrow}>원할 때만 선택해요</span><h2 id="personalization-title">내게 맞는 학습·혜택 안내</h2></div><span className={styles.badge}>{error && !snapshot ? '확인 필요' : summary}</span></div>
    <p className={styles.lead}>구매·학습 기록을 바탕으로 나에게 맞는 안내를 준비해요.</p>
    <p className={styles.help}>동의하지 않아도 결제·수강은 그대로예요. 회원 정보에서 언제든 취소할 수 있어요.</p>
    {snapshot && !open && <div className={styles.actions}><button type="button" className={styles.primary} aria-expanded={false} aria-controls="personalization-options" onClick={() => { setOpen(true); setNotice(''); }} disabled={busy}>선택 항목 보기</button>{hasConsent && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void save({ ...noPersonalization })}>분석·국외 이전 동의 취소</button>}</div>}
    {open && snapshot && <div id="personalization-options" className={styles.options}>
      {!snapshot.accepting && <p className={styles.help}>새 맞춤 안내를 준비 중이에요. 지금은 기존 동의만 취소할 수 있어요.</p>}
      {snapshot.needsRenewal && <p className={styles.help}>안내 내용이 바뀌어 새 동의가 필요해요. 확인하기 전에는 맞춤 분석에 사용하지 않아요.</p>}
      <div className={styles.option}>
        <label><input type="checkbox" checked={choices.analysis} disabled={busy || !snapshot.accepting} onChange={e => { setChoices({ ...choices, analysis: e.target.checked }); setNotice(''); }}/><span><strong>[선택] 구매·학습 기록 분석</strong><small>맞춤 안내를 위해 이용 패턴과 향후 이용 가능성을 분석해요.</small></span></label>
        <details><summary>사용하는 정보와 보관 기간</summary><p>{snapshot.terms?.analysis ?? '안내 내용을 준비 중이에요.'}</p></details>
      </div>
      <div className={styles.option}>
        <label><input type="checkbox" checked={choices.overseas} disabled={busy || !snapshot.accepting} onChange={e => { setChoices({ ...choices, overseas: e.target.checked }); setNotice(''); }}/><span><strong>[선택] AI 맞춤 혜택을 위한 해외 분석 서버 이용</strong><small>나에게 맞는 교육·혜택을 추천하기 위해 구매·학습 기록을 해외 분석 서버에서 처리해요.</small></span></label>
        <details><summary>개인정보 국외 이전 상세 안내</summary><p>{snapshot.terms?.overseas ?? '실제 처리 국가와 업체가 확정된 뒤 동의를 받을 수 있어요.'}</p></details>
      </div>
      <p className={styles.help}>현재 맞춤 안내는 위 두 항목에 모두 동의한 경우에만 이용할 수 있어요. 광고 소식을 받는 것은 아래 ‘소식 수신 설정’에서 따로 선택해요.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy || !!unchanged || (!snapshot.accepting && (choices.analysis || choices.overseas))} onClick={() => void save(choices)}>선택 저장</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setOpen(false); setChoices(snapshot.needsRenewal ? { ...noPersonalization } : snapshot.choices); }}>변경하지 않고 닫기</button>
        {hasConsent && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void save({ ...noPersonalization })}>분석·국외 이전 동의 취소</button>}
      </div>
    </div>}
    {busy && <p role="status" className={styles.help}>저장 내용을 확인하고 있어요.</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <div className={styles.failure}><p role="alert">{error}</p><div className={styles.actions}>{retryable && <button className={styles.secondary} disabled={busy} onClick={() => void save(attempt.current!.choices, true)}>같은 선택 다시 저장</button>}<button type="button" className={styles.secondary} disabled={busy} onClick={() => void reload()}>저장된 설정 다시 불러오기</button></div></div>}
  </section>;
}
