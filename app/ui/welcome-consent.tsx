'use client';
import { useEffect, useRef, useState } from 'react';
import { Gift } from 'lucide-react';
import Link from 'next/link';
import { useWelcomeConsent } from './use-welcome-consent';
import { WelcomeConsentOptions } from './welcome-consent-options';
import { WELCOME_CONSENT_NOTICE, type WelcomeChoices, type ConsentScope } from '@/lib/welcome-consent';
import styles from './welcome-consent.module.css';
export function WelcomeConsent({ settings=false }: { settings?:boolean }) {
  const state=useWelcomeConsent(), s=state.snapshot, box=useRef<HTMLElement>(null);
  const [closed,setClosed]=useState(false);
  const shown=!!s && !closed && (settings || !s.handled && s.reward.available && !s.reward.awarded);
  useEffect(()=>{ if(settings || !shown)return; const before=document.activeElement as HTMLElement|null;box.current?.focus();return ()=>before?.focus?.();},[settings,shown]);
  if(!s)return settings ? <section id="consent-settings" className={styles.card}><h2>선택 동의 관리</h2>{state.error ? <><p role="alert">{state.error}</p><button type="button" onClick={()=>void state.reload()}>다시 불러오기</button></> : <p role="status">설정을 불러오는 중이에요.</p>}</section> : null;
  if(!shown)return !settings && state.notice ? <p className={styles.status} role="status">{state.notice} {s.reward.awarded && <Link href="/my/coupons">내 쿠폰 보기</Link>}</p> : null;
  const allReady=s.accepting.marketing && s.accepting.personal && s.accepting.meta, some=Object.values(state.choices).some(Boolean), locked=state.busy || state.unresolved;
  const change=(next:WelcomeChoices,scope:ConsentScope)=>{state.setChoices(next);if(settings)void state.save(scope,next);};
  const content=<section ref={box} tabIndex={settings ? undefined : -1} id={settings ? 'consent-settings' : undefined} role={settings ? undefined : 'dialog'} aria-label={settings ? '선택 동의 관리' : '선택 동의'} className={`${styles.card} ${settings ? styles.settings : ''}`} onKeyDown={e=>{if(!settings && e.key==='Escape'){e.stopPropagation();setClosed(true);}}}>
    <div className={styles.heading}><Gift size={24} aria-hidden="true"/><div><h2>{settings ? '선택 동의 관리' : '1만원 쿠폰, 지금 받아 가세요'}</h2>{settings && <p>가입 후 선택한 내용을 확인하고 각 항목을 바꿀 수 있어요. 체크를 바꾸면 바로 저장해요.</p>}<p>{!settings && s.reward.available && '쿠폰은 마케팅 정보 수신만 동의해도 드려요. '}{WELCOME_CONSENT_NOTICE}</p></div></div>
    <WelcomeConsentOptions snapshot={s} value={state.choices} onChange={change} disabled={locked}/>
    {settings && s.personal.needsRenewal && <div className={styles.detail}><p>맞춤 추천 안내가 바뀌어 기존 동의로는 분석하지 않아요. 새 안내를 확인해 선택하거나 기존 동의를 철회할 수 있어요.</p>{s.personal.choices.analysis && !state.choices.analysis && <button type="button" disabled={locked} onClick={()=>void state.save('analysis',{...state.choices,analysis:false})}>기존 맞춤 추천 동의 철회</button>}{s.personal.choices.overseas && !state.choices.overseas && <button type="button" disabled={locked} onClick={()=>void state.save('overseas',{...state.choices,overseas:false})}>기존 해외 분석 서버 동의 철회</button>}</div>}
    {settings && s.meta.needsRenewal && s.meta.consented && <div className={styles.detail}><p>Meta 안내가 바뀌어 기존 동의로는 구매 정보를 보내지 않아요.</p><button type="button" disabled={locked} onClick={()=>void state.save('meta',{...state.choices,meta:false})}>기존 Meta 동의 철회</button></div>}
    {state.error && <p className={styles.error} role="alert">{state.error}</p>}
    {state.error && <div className={styles.actions}>{state.unresolved && <button type="button" className={styles.primary} disabled={state.busy} onClick={()=>void state.retry()}>같은 선택 다시 확인하기</button>}<button type="button" className={styles.skip} disabled={state.busy} onClick={()=>void state.reload()}>저장된 설정 다시 불러오기</button></div>}
    {settings ? <>{state.notice && <p className={styles.status} role="status">{state.notice}</p>}{s.reward.awarded && <p className={styles.footnote}>쿠폰을 이미 발급받았어요. <Link href="/my/coupons">내 쿠폰 보기</Link></p>}</> : <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={locked || !some && !allReady} onClick={()=>{const next=some ? state.choices : {email:true,kakao:true,analysis:true,overseas:true,meta:true};if(!some)state.setChoices(next);void state.save('welcome',next);}}>{state.busy ? '저장 중…' : some ? '선택한 항목 동의하기' : '모두 동의하고 1만원 쿠폰 받기'}</button>
      <button type="button" className={styles.skip} disabled={locked} onClick={()=>void state.save('dismiss',state.choices)}>괜찮아요</button>
    </div>}
    <p className={styles.footnote}>{s.reward.available ? '마케팅 수신만 선택해도 1만원 쿠폰을 받아요. 유료 클래스 · 최소 결제금액 없음 · 발급 후 30일 · 계정당 1회' : '쿠폰 발급이 준비 중이에요. 선택 동의는 각 항목에서 관리할 수 있어요.'}</p>
  </section>;
  return settings ? content : <div className={styles.sheet}>{content}</div>;
}
