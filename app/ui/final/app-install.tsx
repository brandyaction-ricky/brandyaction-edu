'use client';
/* eslint-disable @next/next/no-img-element -- Small same-origin, prebuilt app icon. */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
    } catch { if (alive.current) setState(old => old && { ...old, available: false, message: '설치 창을 열지 못했어요. ‘앱 추가 방법 보기’를 눌러 따라 해 주세요.' }); }
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
  if (state.installed) return <section className="panel pad app-install" aria-label="앱 사용 상태"><h2>브랜디에듀 설치가 확인되었습니다</h2><p>홈 화면이나 앱 목록의 아이콘으로 학습을 이어가세요.</p>{process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === 'true' && <Link href="/my/messages" className="text-link">메시지·앱 알림 설정 열기</Link>}</section>;
  async function copy() {
    try { await navigator.clipboard.writeText(state!.homeUrl); setCopied('복사했어요. 사파리나 크롬을 열고, 맨 위나 아래의 주소 칸을 길게 눌러 ‘붙여넣기’를 선택해 주세요.'); }
    catch { setCopied('주소를 길게 누르거나 선택해서 직접 복사해 주세요.'); }
  }
  return <section className="panel pad app-install" aria-label="브랜디에듀 홈 화면 추가">
    <div className="app-install-heading"><img src="/api/app-branding?icon=192" onError={event => { if (!event.currentTarget.src.endsWith('/icons/edu-192.png')) event.currentTarget.src = '/icons/edu-192.png'; }} width={56} height={56} alt=""/><div><h2>홈 화면에서 바로 학습하세요</h2><p>브랜디에듀 아이콘을 추가하면 앱처럼 열 수 있어요.</p></div></div>
    {state.embedded && <div className="notice mt16"><p><strong>먼저 사파리나 크롬으로 열어 주세요.</strong></p><p>지금 보고 있는 앱의 메뉴(⋮ 또는 …)에서 ‘외부 브라우저로 열기’를 누르세요. 이 메뉴가 없으면 아래 주소를 복사해 주세요.</p><input aria-label="설치할 사이트 주소" readOnly value={state.homeUrl}/><button type="button" className="btn small" onClick={() => void copy()}>사이트 주소 복사</button>{copied && <p role="status">{copied}</p>}</div>}
    <div className="app-install-actions mt16">
      {(state.available || state.busy) && !state.embedded && <button type="button" className="btn primary" disabled={state.busy} onClick={state.install}>{state.busy ? '설치 창을 확인해 주세요' : '앱 설치하기'}</button>}
      <button type="button" className={`btn ${state.available || state.busy ? '' : 'primary'}`} aria-expanded={guideOpen} aria-controls={guideId} onClick={() => setGuideOpen(open => !open)}>앱 추가 방법 보기</button>
    </div>
    {state.busy && <p role="status">브라우저의 설치 창에서 선택해 주세요.</p>}
    {state.message && <p role="status" className="notice mt16">{state.message}</p>}
    <div id={guideId} hidden={!guideOpen}><AppInstallGuide device={state.device}/></div>
    <p className="app-install-existing mt16"><strong>이미 아이콘을 추가하셨나요?</strong> 홈 화면이나 컴퓨터의 앱 목록에서 ‘브랜디에듀’를 찾아 눌러 주세요. 다시 추가하지 않아도 돼요.</p>
    <p className="meta mt8">학습할 때는 인터넷 연결이 필요해요. 로그인을 요청하면 평소 쓰던 계정으로 로그인해 주세요. 기존 강의와 학습 기록이 그대로 이어져요.</p>
    {!settings && <button type="button" className="btn ghost small mt16" onClick={state.dismiss}>나중에 · 7일 동안 접기</button>}
  </section>;
}

function AppInstallGuide({ device }: { device: InstallDevice }) {
  const [selected, setSelected] = useState(device);
  const [browser, setBrowser] = useState('chrome');
  return <div className="app-install-guide mt16">
    <p><strong>앱을 추가할 기기를 골라 주세요.</strong></p>
    <div className="app-install-devices mt8" role="group" aria-label="앱을 추가할 기기">
      {([['ios', '아이폰·아이패드'], ['android', '갤럭시·안드로이드'], ['desktop', '컴퓨터']] as const).map(([value, label]) => <button key={value} type="button" className="btn small" aria-pressed={selected === value} onClick={() => setSelected(value)}>{label}</button>)}
    </div>
    {selected === 'ios' ? <>
      <ol>
        <li><strong>사파리(Safari)로 이 사이트를 열어요.</strong><span>아이폰의 파란 나침반 모양 앱이에요.</span></li>
        <li><strong>공유 버튼을 눌러요.</strong><span>네모 위로 화살표가 올라가는 모양이에요. 안 보이면 메뉴(…)를 먼저 눌러 보세요.</span></li>
        <li><strong>아래로 내려 ‘홈 화면에 추가’를 눌러요.</strong><span>없으면 목록 맨 아래 ‘동작 편집’에서 ‘홈 화면에 추가’를 찾아 주세요.</span></li>
        <li><strong>‘추가’를 누르면 끝이에요.</strong><span>‘웹 앱으로 열기’가 보이면 켜 둔 채로 추가해 주세요.</span></li>
      </ol>
      <p className="app-install-done">이제 휴대폰 홈 화면에서 ‘브랜디에듀’ 아이콘을 눌러 보세요.</p>
    </> : selected === 'android' ? <>
      <ol>
        <li><strong>크롬(Chrome)으로 이 사이트를 열어요.</strong><span>빨강·노랑·초록색 동그라미 모양 앱이에요.</span></li>
        <li><strong>오른쪽 위 점 3개(⋮)를 눌러요.</strong></li>
        <li><strong>‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러요.</strong></li>
        <li><strong>새 창에서 ‘설치’ 또는 ‘추가’를 눌러요.</strong><span>한 번 더 물어보면 ‘추가’를 눌러 주세요.</span></li>
      </ol>
      <p className="app-install-done">이제 휴대폰 홈 화면이나 앱 목록에서 ‘브랜디에듀’ 아이콘을 눌러 보세요.</p>
    </> : <>
      <label className="app-install-browser mt16">사용할 인터넷 앱<select value={browser} onChange={event => setBrowser(event.target.value)}><option value="chrome">크롬(Chrome)</option><option value="edge">엣지(Edge)</option><option value="safari">맥 사파리(Safari)</option></select></label>
      {browser === 'safari' ? <ol>
        <li><strong>사파리(Safari)로 이 사이트를 열어요.</strong></li>
        <li><strong>화면 맨 위 ‘파일’을 눌러요.</strong></li>
        <li><strong>‘Dock에 추가’를 눌러요.</strong><span>Dock은 화면 가장자리에 앱 아이콘이 모여 있는 줄이에요.</span></li>
        <li><strong>‘추가’를 누르면 끝이에요.</strong><span>아이콘이 모인 줄에서 ‘브랜디에듀’를 눌러 열 수 있어요.</span></li>
      </ol> : <ol>
        <li><strong>{browser === 'edge' ? '엣지(Edge)' : '크롬(Chrome)'}로 이 사이트를 열어요.</strong></li>
        <li><strong>오른쪽 위 점 3개({browser === 'edge' ? '…' : '⋮'})를 눌러요.</strong></li>
        {browser === 'edge' ? <li><strong>‘앱’ → ‘이 사이트를 앱으로 설치’를 눌러요.</strong><span>‘앱’이 안 보이면 ‘추가 도구’ 안에서 찾아 주세요.</span></li> : <li><strong>‘전송, 저장 및 공유’ → ‘페이지를 앱으로 설치’를 눌러요.</strong><span>‘브랜디에듀 설치’라고 표시될 수도 있어요.</span></li>}
        <li><strong>새 창에서 ‘설치’를 누르면 끝이에요.</strong><span>다음부터 컴퓨터의 앱 목록에서 ‘브랜디에듀’를 찾아 열어 주세요.</span></li>
      </ol>}
    </>}
    <p className="meta mt16">메뉴 이름은 기기에 따라 조금 다를 수 있어요. 찾기 어렵다면 지금처럼 사이트에서 학습해도 괜찮아요.</p>
  </div>;
}
