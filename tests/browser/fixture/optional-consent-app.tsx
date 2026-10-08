import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import SocialConsentPage from '../../../app/auth/consent/page';
import { ConsentRewardCard } from '../../../app/ui/consent-reward-card';
import { PersonalizationSettings } from '../../../app/ui/personalization-settings';
import { ConsentSettings } from '../../../app/ui/consent-settings';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/integration.css';
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
function Fixture() {
  const path=useSyncExternalStore(subscribe,()=>location.pathname);
  if(path==='/consent-reward-test')return <main className="edu-member" style={{padding:'16px',maxWidth:'800px',margin:'auto'}}><h1>마이페이지</h1><section style={{background:'white',padding:'24px',borderRadius:'14px'}}><h2>내 클래스</h2><p>AI 문샷 챌린지 · 4기</p><button>이어서 학습하기</button></section><ConsentRewardCard memberKey="synthetic-member"/></main>;
  if(path==='/optional-signup-test')return <SocialConsentPage/>;
  if(path==='/my')return <h1>가입 완료 목적지</h1>;
  return <main className="edu-member" style={{padding:'24px',maxWidth:'760px',margin:'auto'}}><p className="eyebrow">BRANDYACTION EDU · 화면 검수용</p><h1>회원 정보</h1>{path==='/personalization-consent-test' && <PersonalizationSettings/>}<ConsentSettings/></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
