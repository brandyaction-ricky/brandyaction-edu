"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { POLICY_VERSION, CURRENT_PRIVACY_VERSION } from '@/lib/legal-policies';
import { RequiredConsent } from '@/app/ui/consent-policy';
import { safeNext } from '@/lib/platform';
import { disableDevicePush } from '@/lib/web-push-client';
/** Required signup is completed once. Optional choices belong to the welcome card. */
export default function SocialConsentPage() {
  const router=useRouter(), working=useRef(false);
  const [required,setRequired]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  async function complete() {
    if(working.current || !required)return;
    working.current=true;setPending(true);setMessage('');
    try {
      const {error}=await createClient().auth.updateUser({data:{terms_version:POLICY_VERSION,privacy_version:CURRENT_PRIVACY_VERSION,consented_at:new Date().toISOString()}});
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
  return <div className="edu-front"><main className="form-page"><section className="form-card"><div>
    <div className="text-center"><Link href="/" className="eyebrow">BRANDYACTION EDU</Link><h1>서비스 이용 동의</h1><p className="muted mt16">필수 약관에 동의하면 회원가입이 완료됩니다.</p></div>
    <fieldset className="stack mt32 email-auth-fields" disabled={pending}><RequiredConsent checked={required} onChange={setRequired}/></fieldset>
    {message && <p className="notice mt16" role="alert">{message}</p>}
    <button className="btn primary full mt24" type="button" disabled={pending || !required} onClick={()=>void complete()}>{pending ? '저장 중...' : '동의하고 가입 완료'}<ArrowRight/></button>
    <button className="btn ghost full mt8" type="button" disabled={pending} onClick={()=>void cancel()}>동의하지 않고 나가기</button>
    <p className="meta flex mt24"><CheckCircle2/>동의 일시와 약관 버전이 가입 기록에 저장됩니다.</p>
  </div></section></main></div>;
}
