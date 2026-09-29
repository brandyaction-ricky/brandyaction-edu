import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import SocialConsentPage from '../../../app/auth/consent/page';
import '../../../app/ui/final/frontend.css';
import '../../../app/ui/final/tokens.css';
import '../../../app/ui/final/integration.css';
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
function Fixture() {
  const path = useSyncExternalStore(subscribe, () => location.pathname);
  return path === '/signup-consent-test' ? <SocialConsentPage/> : <h1>{path === '/login' ? '로그인 화면' : '가입 완료 목적지'}</h1>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture/></StrictMode>);
