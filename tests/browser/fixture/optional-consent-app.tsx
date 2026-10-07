import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import SocialConsentPage from '../../../app/auth/consent/page';
import { ConsentSettings } from '../../../app/ui/consent-settings';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/integration.css';
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
function Fixture() {
  const path=useSyncExternalStore(subscribe,()=>location.pathname);
  if(path==='/optional-signup-test')return <SocialConsentPage/>;
  if(path==='/my')return <h1>가입 완료 목적지</h1>;
  return <main className="edu-member" style={{padding:'24px',maxWidth:'760px',margin:'auto'}}><p className="eyebrow">BRANDYACTION EDU · 화면 검수용</p><h1>회원 정보</h1><ConsentSettings/></main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
