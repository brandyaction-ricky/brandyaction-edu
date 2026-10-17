"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Gift } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { POLICY_VERSION, CURRENT_PRIVACY_VERSION } from '@/lib/legal-policies';
import { RequiredConsent } from '@/app/ui/consent-policy';
import { WelcomeConsentOptions } from '@/app/ui/welcome-consent-options';
import { useWelcomeConsent } from '@/app/ui/use-welcome-consent';
import { noWelcomeChoices, WELCOME_CONSENT_NOTICE } from '@/lib/welcome-consent';
import styles from '@/app/ui/welcome-consent.module.css';
import { safeNext } from '@/lib/platform';
import { disableDevicePush } from '@/lib/web-push-client';
/** Required and optional choices share the final signup screen and submission. */
export default function SocialConsentPage() {
  const router=useRouter(), working=useRef(false);
  const optionalEnabled=process.env.NEXT_PUBLIC_EDU_OPTIONAL_CONSENT_ENABLED==='true';
  const optional=useWelcomeConsent(optionalEnabled), snapshot=optional.snapshot;
  const [required,setRequired]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  const [checkingRequired,setCheckingRequired]=useState(true),[kakaoRequired,setKakaoRequired]=useState<{agreedAt:string}|null>(null);
  useEffect(()=>{
    const controller=new AbortController(),timer=setTimeout(()=>{controller.abort();setCheckingRequired(false);},4000);
    void fetch('/api/auth/signup-consent',{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)return;const proof=await response.json();if(!controller.signal.aborted && proof.requiredAccepted===true && typeof proof.agreedAt==='string' && Number.isFinite(Date.parse(proof.agreedAt)))setKakaoRequired({agreedAt:proof.agreedAt});})
      .catch(()=>{}).finally(()=>{clearTimeout(timer);if(!controller.signal.aborted)setCheckingRequired(false);});
    return ()=>{clearTimeout(timer);controller.abort();};
  },[]);
  const accepted=required || !!kakaoRequired;
  const some=Object.values(optional.choices).some(Boolean);
  const allReady=!!snapshot && !snapshot.handled && snapshot.accepting.marketing && snapshot.accepting.personal && snapshot.accepting.meta;
  const coupon=!!snapshot?.reward.available;
  const offerAll=allReady && coupon && !some;
  const locked=pending || optional.busy || checkingRequired;
  async function complete(mode:'selected'|'all'|'required'|'continue'|'retry'='selected') {
    if(working.current || !accepted || checkingRequired)return;
    working.current=true;setPending(true);setMessage('');
    try {
      // Save optional receipts first. If Auth later fails, a retry sees handled=true
      // and completes required consent without issuing another coupon or receipt.
      if(snapshot && !snapshot.handled && mode!=='continue') {
        const choices=mode==='all' ? {email:true,kakao:true,analysis:true,overseas:true,meta:true} : mode==='required' ? {...noWelcomeChoices} : optional.choices;
        if(mode==='all')optional.setChoices(choices);
        const saved=mode==='retry' ? await optional.retry() : await optional.save('welcome',choices);
        // An unavailable optional service cannot prevent required-only signup.
        if(!saved && mode!=='required')return;
      }
      const {error}=await createClient().auth.updateUser({data:{terms_version:POLICY_VERSION,privacy_version:CURRENT_PRIVACY_VERSION,consented_at:kakaoRequired?.agreedAt ?? new Date().toISOString()}});
      if(error)throw Error('약관 동의를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      router.replace(safeNext(new URLSearchParams(window.location.search).get('next')));router.refresh();
    } catch(cause){setMessage(cause instanceof Error ? cause.message : '저장하지 못했습니다. 다시 시도해 주세요.');}
    finally{working.current=false;setPending(false);}
  }
  async function cancel(){
    if(working.current)return;working.current=true;setPending(true);
    try{await disableDevicePush().catch(()=>{});await createClient().auth.signOut({scope:'local'});router.replace('/login');router.refresh();}
    catch{setMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.');}finally{working.current=false;setPending(false);}
  }
  const primary=offerAll ? '모두 동의하고 1만원 쿠폰 받기' : some && coupon && (optional.choices.email || optional.choices.kakao) ? '동의하고 1만원 쿠폰 받아 가입 완료' : '동의하고 가입 완료';
  return <div className="edu-front"><main className="form-page"><section className="form-card"><div>
    <div className="text-center"><Link href="/" className="eyebrow">BRANDYACTION EDU</Link><h1>서비스 이용 동의</h1><p className="muted mt16">가입에 필요한 동의와 선택 사항을 한 번에 확인해 주세요.</p></div>
    {checkingRequired ? <p className="muted mt32" role="status">필수 약관 동의를 확인하고 있어요.</p> : kakaoRequired ? <div className="notice mt32"><p className="flex"><CheckCircle2/>필수 약관은 카카오에서 동의한 내용을 확인했어요.</p><p className="meta"><Link href="/policies/terms" target="_blank">이용약관 보기</Link> · <Link href="/policies/privacy" target="_blank">개인정보처리방침 보기</Link></p></div> : <fieldset className="stack mt32 email-auth-fields" disabled={locked}><RequiredConsent checked={required} onChange={setRequired}/></fieldset>}
    {optionalEnabled && <section className={styles.signup} aria-label="선택 동의">
      <div className={styles.heading}><Gift size={24} aria-hidden="true"/><div><h2>{coupon ? '1만원 쿠폰, 가입할 때 받아 가세요' : '혜택 소식과 맞춤 추천'}</h2><p>{coupon && '쿠폰은 마케팅 정보 수신만 동의해도 드려요. '}{WELCOME_CONSENT_NOTICE}</p></div></div>
      {snapshot ? <><WelcomeConsentOptions snapshot={snapshot} value={optional.choices} onChange={value=>optional.setChoices(value)} disabled={locked || optional.unresolved || snapshot.handled}/>
        {snapshot.handled && <p className={styles.footnote}>선택 항목은 이미 저장했어요. 아래에서 가입을 마무리해 주세요.</p>}
        {coupon && <p className={styles.footnote}>이메일 또는 카카오 한 채널만 선택해도 발급 · 유료 클래스 · 최소 결제금액 없음 · 발급 후 30일 · 계정당 1회</p>}</> : !optional.error && <p className={styles.footnote} role="status">선택 사항을 불러오는 중이에요. 기다리지 않고 필수 동의만으로 가입해도 돼요.</p>}
      {optional.error && <><p className={styles.error} role="alert">{optional.error}</p><div className={styles.actions}>
        {optional.unresolved && <button className={styles.primary} type="button" disabled={locked || !accepted} onClick={()=>void complete('retry')}>같은 선택으로 다시 확인하고 가입 완료</button>}
        <button className={styles.skip} type="button" disabled={locked} onClick={()=>void optional.reload()}>저장된 선택 다시 불러오기</button>
        <button className={styles.skip} type="button" disabled={locked || !accepted} onClick={()=>void complete('continue')}>가입 완료하고 선택 동의는 회원 정보에서 확인</button>
      </div></>}
    </section>}
    {message && <p className="notice mt16" role="alert">{message}</p>}
    <button className="btn primary full mt24" type="button" disabled={locked || !accepted || optional.unresolved} onClick={()=>void complete(offerAll ? 'all' : 'selected')}>{pending ? '저장 중...' : primary}<ArrowRight/></button>
    {offerAll && <button className="btn ghost full mt8" type="button" disabled={locked || !accepted || optional.unresolved} onClick={()=>void complete('required')}>{kakaoRequired ? '선택하지 않고 가입 완료' : '필수만 동의하고 가입 완료'}</button>}
    <button className="btn ghost full mt8" type="button" disabled={locked} onClick={()=>void cancel()}>동의하지 않고 나가기</button>
    <p className="meta flex mt24"><CheckCircle2/>선택하지 않아도 가입·결제·수강할 수 있어요. 동의 일시와 약관 버전을 기록해요.</p>
  </div></section></main></div>;
}
