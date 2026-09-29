'use client';
/* eslint-disable @next/next/no-img-element -- Small same-origin, prebuilt app icon. */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { installDevice, embeddedBrowser, installDismissed, installDismissKey, installDismissMs, type InstallDevice } from '@/lib/app-install';
import './app-install.css';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type InstallState = { device: InstallDevice; embedded: boolean; installed: boolean; dismissed: boolean; available: boolean; busy: boolean; message: string; homeUrl: string };
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
      installed: installed(), dismissed: dismissed(), available: false, busy: false, message: '', homeUrl: new URL('/my', location.origin).href });
    const ready = (event: Event) => {
      if (typeof (event as InstallPrompt).prompt !== 'function') return;
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
    } catch { if (alive.current) setState(old => old && { ...old, available: false, message: '설치 창을 열지 못했습니다. 아래의 브라우저 메뉴 안내를 확인해 주세요.' }); }
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
  if (!state || !settings && (state.installed || state.dismissed)) return null;
  if (state.installed) return <section className="panel pad app-install" aria-label="앱 사용 상태"><h2>브랜디에듀 설치가 확인되었습니다</h2><p>홈 화면이나 앱 목록의 아이콘으로 학습을 이어가세요.</p>{process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === 'true' && <Link href="/my/messages" className="text-link">메시지·앱 알림 설정 열기</Link>}</section>;
  async function copy() {
    try { await navigator.clipboard.writeText(state!.homeUrl); setCopied('주소를 복사했습니다. Safari 또는 Chrome 주소창에 붙여넣어 주세요.'); }
    catch { setCopied('주소를 길게 누르거나 선택해서 직접 복사해 주세요.'); }
  }
  return <section className="panel pad app-install" aria-label="브랜디에듀 홈 화면 추가">
    <div className="app-install-heading"><img src="/icons/edu-192.png" width={56} height={56} alt=""/><div><h2>홈 화면에서 바로 학습하세요</h2><p>브랜디에듀 아이콘을 추가하면 앱처럼 열 수 있어요.</p></div></div>
    {state.embedded && <div className="notice mt16"><p>지금 보고 있는 앱의 메뉴에서 ‘외부 브라우저로 열기’를 선택해 주세요. 메뉴가 없다면 아래 주소를 복사해 Safari 또는 Chrome에서 열어 주세요.</p><input aria-label="설치할 사이트 주소" readOnly value={state.homeUrl}/><button type="button" className="btn small" onClick={() => void copy()}>사이트 주소 복사</button>{copied && <p role="status">{copied}</p>}</div>}
    {state.available && !state.embedded && <button type="button" className="btn primary mt16" disabled={state.busy} onClick={state.install}>브랜디에듀 설치</button>}
    {state.busy && <p role="status">브라우저의 설치 창에서 선택해 주세요.</p>}
    {state.message && <p role="status" className="notice mt16">{state.message}</p>}
    <details className="mt16" open={!state.available || state.embedded}>
      <summary>브라우저 메뉴에서 추가하는 방법</summary>
      {state.device === 'ios' ? <ol><li>Safari에서 브랜디에듀를 열고 공유 버튼을 누르세요. 공유 버튼은 ‘더 보기(…)’ 안에 있을 수도 있어요.</li><li>‘홈 화면에 추가’를 선택하세요. 보이지 않으면 ‘동작 편집’에서 추가하세요.</li><li>‘웹 앱으로 열기’가 보이면 켠 상태로 ‘추가’를 누르세요.</li></ol>
        : state.device === 'android' ? <ol><li>Chrome에서 브랜디에듀를 열고 오른쪽 위 메뉴(⋮)를 누르세요.</li><li>‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택하세요.</li><li>안내에 따라 추가한 뒤 홈 화면의 브랜디에듀 아이콘을 누르세요.</li></ol>
        : <p className="mt8">Chrome·Edge에서는 주소창의 설치 아이콘이나 메뉴의 ‘앱 설치’를 찾아주세요. Mac Safari에서는 ‘파일 → Dock에 추가’를 사용할 수 있습니다. 메뉴가 없는 브라우저에서는 웹사이트로 계속 이용해 주세요.</p>}
    </details>
    <p className="meta mt16">인터넷 연결이 필요합니다. 설치한 뒤 로그인을 다시 요청할 수 있어요.{process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === 'true' ? ' 알림은 앱을 열고 ‘메시지 → 앱 알림’에서 직접 켤 수 있습니다.' : ' 아이콘으로 열어도 기존 강의와 기록을 그대로 이용할 수 있어요.'}</p>
    {!settings && <button type="button" className="btn ghost small mt16" onClick={state.dismiss}>나중에 · 7일 동안 접기</button>}
    {settings && <p className="meta mt8">이미 추가했다면 홈 화면이나 앱 목록의 브랜디에듀 아이콘으로 열어 주세요.</p>}
  </section>;
}
