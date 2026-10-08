'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Gift, ChevronRight } from 'lucide-react';
import { noRewardChoices, type RewardChoices, type RewardPayload, type RewardSnapshot } from '@/lib/consent-reward';
import { OPTIONAL_CONSENT_VERSION } from '@/lib/optional-consent';
import styles from './consent-reward-card.module.css';
const endpoint = '/api/account/consent-reward';
export function ConsentRewardCard({ memberKey }: { memberKey: string }) {
  const [snapshot, setSnapshot] = useState<RewardSnapshot | null>(null);
  const [choices, setChoices] = useState<RewardChoices>({ ...noRewardChoices });
  const [pending, setPending] = useState(false);
  const [hidden, setHidden] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [conflict, setConflict] = useState(false), [done, setDone] = useState<{ awarded: boolean } | null>(null);
  const parent = useRef<HTMLInputElement>(null), working = useRef(false);
  const attempt = useRef<{ requestId: string; payload: RewardPayload } | null>(null);
  const key = `edu-consent-reward-dismissed:${memberKey}`;
  useEffect(() => {
    const controller = new AbortController();
    try { if (Number(localStorage.getItem(key)) > Date.now()) return; } catch { /* Storage is optional. */ }
    void fetch(endpoint, { cache: 'no-store', signal: controller.signal }).then(async r => {
      if (!r.ok) return;
      const body = await r.json();
      if (!controller.signal.aborted) setSnapshot(body);
    }).catch(() => { /* Never interrupt learning when a promotional card fails. */ });
    return () => controller.abort();
  }, [key]);
  const all = choices.analysis && choices.overseas && choices.kakao;
  const any = Object.values(choices).some(Boolean);
  useEffect(() => { if (parent.current) parent.current.indeterminate = any && !all; }, [any, all, snapshot]);
  function dismiss() {
    try { localStorage.setItem(key, String(Date.now() + 30 * 86400000)); } catch { /* No consent mutation. */ }
    setHidden(true);
  }
  async function reload() {
    setBusy(true);
    try {
      const r = await fetch(endpoint, { cache: 'no-store' }); if (!r.ok) throw Error();
      setSnapshot(await r.json()); setChoices({ ...noRewardChoices }); attempt.current = null; setPending(false); setConflict(false); setError('');
    } catch { setError('안내를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (working.current || !snapshot || conflict) return;
    if (!attempt.current) attempt.current = { requestId: crypto.randomUUID(), payload: {
      choices: { ...choices }, personalRevision: snapshot.personalRevision, marketingRevision: snapshot.marketingRevision,
      wordingVersion: snapshot.terms?.version ?? null, marketingVersion: OPTIONAL_CONSENT_VERSION,
    } };
    working.current = true; setPending(true); setBusy(true); setError('');
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.current) });
      const body = await r.json();
      if (!r.ok) { if (r.status === 409 || r.status === 400 || r.status === 403) setConflict(true); throw Error(body.error); }
      setDone({ awarded: body.awarded === true }); attempt.current = null; setPending(false);
    } catch (cause) { setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : '저장 결과를 확인하지 못했어요. 아래 버튼으로 다시 확인해 주세요.'); }
    finally { working.current = false; setBusy(false); }
  }
  if (hidden || (!done && (!snapshot?.available || snapshot.handled || snapshot.awarded))) return null;
  if (done) return <section className={styles.card} aria-label="선택 동의 완료"><div role="status"><strong>{done.awarded ? '1만원 쿠폰을 내 쿠폰함에 넣었어요!' : '선택한 내용을 저장했어요.'}</strong><p>회원 정보에서 언제든 동의를 취소할 수 있어요.</p></div><div className={styles.success}>{done.awarded && <Link href="/my/coupons">내 쿠폰 보기 <ChevronRight size={16}/></Link>}<button type="button" onClick={() => setHidden(true)}>닫기</button></div></section>;
  const locked = busy || pending || conflict;
  const option = (name: keyof RewardChoices, title: string, detail: string, disabled = false) => <div className={styles.option}>
    <label><input type="checkbox" checked={choices[name]} disabled={locked || disabled} onChange={e => setChoices({ ...choices, [name]: e.target.checked })}/><span>{title}{name === 'overseas' && <small className={styles.description}>나에게 맞는 교육·혜택을 추천하기 위해 구매·학습 기록을 해외 분석 서버에서 처리해요.</small>}{name === 'kakao' && <small className={styles.coupon}>쿠폰</small>}</span></label>
    <details><summary aria-label={`${title} 자세히`}><ChevronRight size={18}/></summary><p>{name === 'overseas' && <><strong>개인정보 국외 이전 안내</strong><br/></>}{detail}</p></details>
  </div>;
  return <section className={styles.card} aria-labelledby="consent-reward-title">
    <div className={styles.heading}><Gift size={27} aria-hidden="true"/><div><h2 id="consent-reward-title">1만원 할인쿠폰 받고,<br className={styles.mobileBreak}/> 나에게 맞는 혜택을 받아보세요</h2><p>혜택 소식 받기만 동의해도 쿠폰을 드려요.<br/>선택하지 않아도 수강은 그대로예요.</p></div></div>
    <label className={styles.all}><input ref={parent} type="checkbox" checked={all} aria-checked={any && !all ? 'mixed' : all} disabled={locked || !snapshot!.analysisAvailable} onChange={e => setChoices({ analysis: e.target.checked, overseas: e.target.checked, kakao: e.target.checked })}/><span>선택 항목 모두 동의하기 <small>선택 3개</small></span></label>
    <div className={styles.options}>
      {option('analysis', '[선택] 구매·학습 기록 분석', snapshot!.terms?.analysis ?? '안내를 준비 중이에요. 지금은 선택할 수 없어요.', !snapshot!.analysisAvailable)}
      {option('overseas', '[선택] AI 맞춤 혜택을 위한 해외 분석 서버 이용', snapshot!.terms?.overseas ?? '실제 처리 국가와 업체를 확인한 후 안내할게요.', !snapshot!.analysisAvailable)}
      {option('kakao', '[선택] 카카오톡 혜택 소식 받기(광고)', '주식회사 브랜디액션(브랜디에듀)이 교육·할인·행사 안내 대상을 고르기 위해 이름, 휴대폰 번호, 이메일, 구매·수강 기록을 이용하고, 휴대폰 번호로 카카오톡 광고를 보내는 데 동의합니다. 동의를 취소하거나 탈퇴할 때까지 이용합니다. 동의하지 않아도 수강에 제한이 없습니다. 이메일·문자 수신 설정은 바뀌지 않습니다.')}
    </div>
    <p className={styles.conditions}>유료 강의 · 최소 결제금액 없음 · 발급 후 {snapshot!.reward.days}일 · 계정당 1회</p>
    <button type="button" className={styles.primary} disabled={busy || !any || conflict} onClick={() => void save()}>{busy ? '저장하고 있어요…' : pending ? '저장 결과 다시 확인하기' : choices.kakao || !any ? '동의하고 1만원 쿠폰 받기' : '선택한 내용에 동의하기'}</button>
    {error && <div role="alert" className={styles.error}>{error}{conflict && <button type="button" onClick={() => void reload()} disabled={busy}>다시 불러오기</button>}</div>}
    <button type="button" className={styles.skip} onClick={dismiss} disabled={busy || pending}>지금은 괜찮아요</button>
    <p className={styles.footnote}>기존 동의는 유지돼요. 변경·취소는 <Link href="/my/profile#personalization-settings">회원 정보</Link>에서 할 수 있어요.</p>
  </section>;
}
