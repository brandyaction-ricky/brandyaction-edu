'use client';
import { useEffect, useState } from 'react';
import { syncTestMode } from '@/lib/landing-browser';
import { usePathname, useSearchParams } from 'next/navigation';
export function LandingTestBanner() {
 const [active,setActive]=useState(false), path=usePathname(), search=useSearchParams();
 useEffect(()=>{ const enabled=syncTestMode(); const timer=setTimeout(()=>setActive(enabled),0); return ()=>clearTimeout(timer); },[path,search]);
 return active ? <div className="landing-test-banner" role="status">이 기기는 테스트 모드 · 방문·전환 이벤트와 Meta Pixel이 기록되지 않습니다.<a href={path+'?testmode=0'}>테스트 모드 해제</a></div> : null;
}
