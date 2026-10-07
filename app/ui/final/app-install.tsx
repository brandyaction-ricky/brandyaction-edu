'use client';
/* eslint-disable @next/next/no-img-element -- Small same-origin, prebuilt app icon. */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AppInstallGuide } from './app-install-guide';
import { installDevice, chromeInstallBrowser, embeddedBrowser, installDismissed, installDismissKey, installDismissMs, type InstallDevice } from '@/lib/app-install';
import './app-install.css';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type InstallState = { device: InstallDevice; embedded: boolean; chrome: boolean; installed: boolean; dismissed: boolean; available: boolean; busy: boolean; message: string; homeUrl: string };
type InstallContextValue = InstallState & { install: () => void; dismiss: () => void };
const InstallContext = createContext<InstallContextValue | null>(null);
export function AppInstallProvider({ children, enabled = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true' }: { children: ReactNode; enabled?: boolean }) {
  const [state, setState] = useState<InstallState | null>(null);
  const prompt = useRef<InstallPrompt | null>(null), busy = useRef(false), alive = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    alive.current = true;
    const display = window.matchMedia('(display-mode: standalone)'), minimal = window.matchMedia('(display-mode: minimal-ui)');
    const installed = () => display.matches || minimal.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const dismissed = () => { try { return installDismissed(localStorage.getItem(installDismissKey), Date.now()); } catch { return false; } };
    // Browser-only values are read after hydration so SSR and the first client render match.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize device/media/storage state; never remount the learning page.
    setState({ device: installDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints), embedded: embeddedBrowser(navigator.userAgent),
      chrome: chromeInstallBrowser(navigator.userAgent), installed: installed(), dismissed: dismissed(), available: false, busy: false, message: '', homeUrl: new URL('/my', location.origin).href });
    const ready = (event: Event) => {
      if (!chromeInstallBrowser(navigator.userAgent) || typeof (event as InstallPrompt).prompt !== 'function') return;
      event.preventDefault(); prompt.current = event as InstallPrompt;
      setState(old => old && { ...old, available: true, message: '' });
    };
    const changed = () => setState(old => old && { ...old, installed: installed() });
    const complete = () => { prompt.current = null; setState(old => old && { ...old, installed: true, available: false, busy: false, message: '' }); };
    const storage = () => setState(old => old && { ...old, dismissed: dismissed() });
    window.addEventListener('beforeinstallprompt', ready); window.addEventListener('appinstalled', complete); window.addEventListener('storage', storage);
    display.addEventListener('change', changed); minimal.addEventListener('change', changed);
    return () => { alive.current = false; prompt.current = null; busy.current = false; window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', complete); window.removeEventListener('storage', storage); display.removeEventListener('change', changed); minimal.removeEventListener('change', changed); };
  }, [enabled]);
  async function install() {
    if (busy.current || !prompt.current) return;
    const event = prompt.current; prompt.current = null; busy.current = true;
    try {
      // Call synchronously within the user's click; no network or permission step first.
      const result = event.prompt(); setState(old => old && { ...old, busy: true, available: false, message: '' });
      await result; const choice = await event.userChoice;
      if (alive.current) setState(old => old && { ...old, message: choice.outcome === 'accepted' ? '설치를 요청했습니다. 완료되면 홈 화면이나 앱 목록에서 브랜디에듀를 열어 주세요.' : '설치를 취소했습니다. 이 사이트에서 그대로 학습할 수 있습니다.' });
    } catch { if (alive.current) setState(old => old && { ...old, available: false, message: '설치 창을 열지 못했어요. ‘그림 보며 따라 하기’를 눌러 따라 해 주세요.' }); }
    finally { busy.current = false; if (alive.current) setState(old => old && { ...old, busy: false }); }
  }
  function dismiss() {
    try { localStorage.setItem(installDismissKey, String(Date.now() + installDismissMs)); } catch { /* Current-page dismissal still works. */ }
    setState(old => old && { ...old, dismissed: true });
  }
  return <InstallContext.Provider value={enabled && state ? { ...state, install: () => void install(), dismiss } : null}>{children}</InstallContext.Provider>;
}
export function AppInstallCard({ settings = false }: { settings?: boolean }) {
  const state = useContext(InstallContext), [copied, setCopied] = useState('');
  const [guideOpen, setGuideOpen] = useState(false), guideId = useId();
  if (!state || !settings && (state.installed || state.dismissed)) return null;
  if (state.installed) return <section className="panel pad app-install" aria-label="앱 사용 상태"><h2>브랜디에듀 설치가 확인되었습니다</h2><p>홈 화면이나 앱 목록의 아이콘으로 학습을 이어가세요.</p>{process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true' && <Link href="/my/questions" className="text-link">질문·답변 알림 설정 열기</Link>}</section>;
  async function copy() {
    try { await navigator.clipboard.writeText(state!.homeUrl); setCopied('복사했어요. 크롬을 열고, 맨 위나 아래의 주소 칸을 길게 눌러 ‘붙여넣기’를 선택해 주세요.'); }
    catch { setCopied('주소를 길게 누르거나 선택해서 직접 복사해 주세요.'); }
  }
  return <section className="panel pad app-install" aria-label="브랜디에듀 홈 화면 추가">
    <div className="app-install-heading"><img src="/api/app-branding?icon=192" onError={event => { if (!event.currentTarget.src.endsWith('/icons/edu-192.png')) event.currentTarget.src = '/icons/edu-192.png'; }} width={56} height={56} alt=""/><div><h2>브랜디에듀 아이콘 추가하기</h2><p>다음부터는 아이콘을 눌러 수업에 들어오세요.</p></div></div>
    <p className="app-install-intro"><strong>브랜디에듀는 스토어에서 받는 앱이 아니에요.</strong><br/>크롬에서 휴대폰 홈 화면이나 컴퓨터에 아이콘을 추가해요. 무료예요.</p>
    {!state.chrome && <div className="notice mt16"><p><strong>먼저 Chrome(크롬)으로 열어 주세요.</strong></p><p>아래 주소를 복사한 뒤 크롬을 직접 열어 주소 칸에 붙여넣으세요. 지금 창의 아이콘 추가 기능은 사용하지 않아요.</p><input aria-label="설치할 사이트 주소" readOnly value={state.homeUrl}/><button type="button" className="btn small" onClick={() => void copy()}>사이트 주소 복사</button>{copied && <p role="status">{copied}</p>}</div>}
    <div className="app-install-actions mt16">
      {(state.available || state.busy) && state.chrome && <button type="button" className="btn primary" disabled={state.busy} onClick={state.install}>{state.busy ? '설치 창을 확인해 주세요' : '아이콘 추가하기'}</button>}
      <button type="button" className={`btn ${state.available || state.busy ? '' : 'primary'}`} aria-expanded={guideOpen} aria-controls={guideId} onClick={() => setGuideOpen(open => !open)}>그림 보며 따라 하기</button>
    </div>
    {state.busy && <p role="status">브라우저의 설치 창에서 선택해 주세요.</p>}
    {state.message && <p role="status" className="notice mt16">{state.message}</p>}
    <div id={guideId} hidden={!guideOpen}>{guideOpen && <AppInstallGuide device={state.device} homeUrl={state.homeUrl}/>}</div>
    <p className="app-install-existing mt16"><strong>이미 아이콘이 잘 열리나요?</strong> 그대로 사용하세요. 열리지 않으면 안내에 따라 크롬에서 새로 추가하세요.</p>
    {!settings && <button type="button" className="btn ghost small mt16" onClick={state.dismiss}>나중에 · 7일 동안 접기</button>}
  </section>;
}
