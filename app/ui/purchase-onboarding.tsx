'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Monitor, Smartphone } from 'lucide-react';
import { TELEGRAM_ANDROID_INSTALL_URL, TELEGRAM_IOS_INSTALL_URL, type SurveyRoom, type TelegramPath } from '@/lib/purchase-onboarding';
import './purchase-onboarding.css';

type View = { orderId: string; orderNumber: string; itemName: string; roomName: string; surveyRoom: SurveyRoom | null; telegramPath: TelegramPath | null; profileImage: string; supportUrl: string; available: boolean; telegramOnly?: boolean };

export function PurchaseOnboarding({ order, guideRequested }: { order: string; guideRequested: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedPath, setSelectedPath] = useState<TelegramPath | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [roomOpened, setRoomOpened] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch('/api/purchase-onboarding' + (order ? `?order=${encodeURIComponent(order)}` : ''), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || '안내를 불러오지 못했습니다.'), { status: response.status });
    setView(data);
    if (guideRequested && !data.telegramOnly && !data.surveyRoom) router.replace('/purchase-onboarding' + (data.orderId ? `?order=${encodeURIComponent(data.orderId)}` : ''));
  }, [order, guideRequested, router]);
  useEffect(() => {
    const timer = setTimeout(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : '안내를 불러오지 못했습니다.')); }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  const submit = async (body: Record<string, unknown>) => {
    if (!view) return null;
    setPending(true); setError('');
    try {
      const response = await fetch('/api/purchase-onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, order: view.orderId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '저장하지 못했습니다.');
      return data;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '다시 시도해 주세요.'); return null; }
    finally { setPending(false); }
  };
  const answer = async (room: SurveyRoom) => { if (await submit({ action: 'answer', room })) { await load(); router.replace(`/purchase-onboarding?order=${encodeURIComponent(view!.orderId)}&step=guide`); } };
  const choosePath = async (path: TelegramPath) => { if (await submit({ action: 'path', path })) setView(current => current ? { ...current, telegramPath: path } : current); };
  const getLink = async (copy: boolean) => {
    const roomWindow = !copy && view?.telegramOnly ? window.open('', '_blank') : null;
    if (roomWindow) roomWindow.opener = null;
    const result = await submit({ action: 'link' });
    if (!result?.url) { roomWindow?.close(); return; }
    if (copy) {
      try { await navigator.clipboard.writeText(result.url); setCopied(true); setManualUrl(''); }
      catch { setManualUrl(result.url); setError('자동 복사가 제한됐습니다. 아래 링크를 길게 눌러 복사해 주세요.'); }
    } else if (view?.telegramOnly) {
      if (roomWindow) { roomWindow.location.replace(result.url); setRoomOpened(true); }
      else setManualUrl(result.url);
    } else window.location.assign(result.url);
  };

  const activeStep = roomOpened ? 2 : 1;
  const title = view?.telegramOnly ? `${view.itemName || '문샷 챌린지'} 시작 준비` : '결제 후 시작 안내';

  return <main className="edu-front purchase-onboarding purchase-onboarding-user">
    <header className="onboarding-header">
      <div className="wrap onboarding-header-inner">
        <Link href="/" className="onboarding-brand" aria-label="Brandy Action EDU 홈">
          <strong>Brandy Action</strong><span>EDU</span>
        </Link>
        <Link className="onboarding-header-link" href="/my/classes">내 클래스</Link>
      </div>
    </header>
    <div className="wrap onboarding-shell">
    <div className="onboarding-title-block">
      <h1>{title}</h1>
      <p>3단계 · 약 5분 · 언제든 마이페이지에서 이어서 할 수 있어요</p>
      {view && <span>{view.itemName} · 주문 {view.orderNumber}</span>}
    </div>
    <ol className="onboarding-steps" aria-label="시작 준비 단계">
      <li className={activeStep === 1 ? 'active' : 'complete'} aria-current={activeStep === 1 ? 'step' : undefined}>
        <span>1단계 · {activeStep === 1 ? '진행 중' : '완료'}</span><strong>공지방 입장</strong>
      </li>
      <li className={activeStep === 2 ? 'active' : ''} aria-current={activeStep === 2 ? 'step' : undefined}>
        <span>2단계</span><strong>OT 확인</strong>
      </li>
      <li><span>3단계</span><strong>첫 학습 시작</strong></li>
    </ol>
    {!view && !error && <p role="status">결제 내역을 확인하고 있습니다.</p>}
    {error && <p className="notice" role="alert">{error}{!view && <Link href="/login">로그인하기</Link>}</p>}
    {view?.telegramOnly && <section className="onboarding-panel onboarding-guide"><h2>{view.roomName || '교육생 공지방'}에 입장해 주세요</h2>
      <p>수업 공지와 질문, 특강 안내는 텔레그램에서 운영해요. 지금 사용 중인 환경에 맞춰 준비해 주세요.</p>
      <div className="onboarding-device-grid">
        <div className="onboarding-device-card">
          <div className="onboarding-device-title"><Smartphone aria-hidden="true"/><div><h3>휴대폰에서 입장해요</h3><p>텔레그램 사용 여부를 선택해 주세요.</p></div></div>
          <div className="onboarding-options onboarding-path-options"><button type="button" aria-pressed={selectedPath === 'existing'} onClick={() => { setSelectedPath('existing'); setCopied(false); }}>이미 텔레그램을 사용해요</button><button type="button" aria-pressed={selectedPath === 'new'} onClick={() => { setSelectedPath('new'); setCopied(false); }}>텔레그램이 처음이에요</button></div>
          {selectedPath === 'existing' && <p className="onboarding-instruction">아래 버튼으로 공지방을 열어 주세요.</p>}
          {selectedPath === 'new' && <div className="onboarding-instruction"><p>앱이 없다면 먼저 설치해 주세요.</p>
            <div className="onboarding-install-actions"><a className="btn" href={TELEGRAM_IOS_INSTALL_URL} target="_blank" rel="noopener noreferrer">iPhone 앱 설치</a><a className="btn" href={TELEGRAM_ANDROID_INSTALL_URL} target="_blank" rel="noopener noreferrer">Android 앱 설치</a></div>
            <p>설치와 가입을 마친 뒤 아래 버튼으로 입장하세요.</p></div>}
          {selectedPath && <button type="button" className="btn primary onboarding-enter-button" aria-label="텔레그램 공지방 입장" disabled={pending} onClick={() => void getLink(false)}>공지방 입장 <ArrowRight aria-hidden="true"/></button>}
        </div>
        <div className="onboarding-device-card onboarding-pc-card">
          <div className="onboarding-device-title"><Monitor aria-hidden="true"/><div><h3>PC에서 확인하고 있어요</h3><p>휴대폰에서 설치와 가입을 먼저 완료해 주세요.</p></div></div>
          <div className="onboarding-pc-guide" aria-hidden="true"><Smartphone/><ArrowRight/><Monitor/></div>
          <p>준비가 끝나면 왼쪽에서 사용 상태를 선택하고 공지방을 열 수 있어요.</p>
        </div>
      </div>
      {view.telegramOnly && manualUrl && <p className="onboarding-fallback">새 창이 열리지 않았다면 <a href={manualUrl} target="_blank" rel="noopener noreferrer" onClick={() => setRoomOpened(true)}>여기에서 공지방 열기</a>를 눌러 주세요.</p>}
      <label className="onboarding-confirm"><input type="checkbox" checked={roomOpened} onChange={event => setRoomOpened(event.target.checked)}/><span><strong>{roomOpened ? '입장을 완료했어요' : '공지방에 입장했어요'}</strong><small>{roomOpened ? '2단계를 확인할 수 있어요.' : '입장을 마친 뒤 체크해 주세요.'}</small></span>{roomOpened && <Check aria-hidden="true"/>}</label>
    </section>}
    {view && !view.telegramOnly && !view.surveyRoom && <section className="onboarding-panel"><h2>1. 어떤 경로로 참여하셨나요?</h2><p>결제 후 안내를 위해 한 가지만 선택해 주세요.</p>
      <div className="onboarding-options"><button type="button" disabled={pending} onClick={() => void answer('paid')}>광고 방에서 참여했어요</button><button type="button" disabled={pending} onClick={() => void answer('organic')}>오가닉 방에서 참여했어요</button><button type="button" disabled={pending} onClick={() => void answer('unknown')}>잘 모르겠어요</button></div></section>}
    {view?.surveyRoom && !view.telegramOnly && <section className="onboarding-panel"><h2>2. 텔레그램 방에 입장해 주세요</h2><p>방 이름: <strong>{view.roomName}</strong></p>
      {view.profileImage && <img className="onboarding-profile" src={view.profileImage} alt="텔레그램 프로필 예시" />}
      <p>입장 전 텔레그램 프로필 이름을 실제 신청자 이름으로 설정해 주세요. 운영자가 신청 내역을 확인하는 데 사용합니다.</p>
      <div className="onboarding-options"><button type="button" aria-pressed={view.telegramPath === 'existing'} disabled={pending} onClick={() => void choosePath('existing')}>이미 텔레그램을 사용해요</button><button type="button" aria-pressed={view.telegramPath === 'new'} disabled={pending} onClick={() => void choosePath('new')}>텔레그램이 처음이에요</button></div>
      {view.telegramPath === 'existing' && <p className="onboarding-instruction">텔레그램에서 내 프로필을 확인한 뒤 아래 버튼으로 방에 입장해 주세요.</p>}
      {view.telegramPath === 'new' && <p className="onboarding-instruction">텔레그램 앱을 설치하고 계정을 만든 뒤 프로필 이름을 설정해 주세요. 준비되면 아래 버튼으로 방에 입장하세요.</p>}
      {view.telegramPath && <div className="onboarding-actions"><button type="button" className="btn primary" disabled={pending} onClick={() => void getLink(false)}>텔레그램 방 입장</button><button type="button" className="btn" disabled={pending} onClick={() => void getLink(true)}>{copied ? '초대 링크 복사됨' : '초대 링크 복사'}</button></div>}
      {manualUrl && <input className="onboarding-manual-link" aria-label="수동 복사용 초대 링크" value={manualUrl} readOnly onFocus={event => event.currentTarget.select()} />}
    </section>}
    {view?.telegramOnly && <section className={`onboarding-next-preview ${roomOpened ? 'ready' : ''}`} aria-live="polite">
      <div><span>다음 · 2단계</span><h2>OT 일정과 참여 방법을 확인하세요</h2><p>{roomOpened ? '내 클래스에서 OT 일정과 Zoom 안내를 확인할 수 있어요.' : '공지방 입장을 완료하면 다음 안내를 이어서 확인할 수 있어요.'}</p></div>
      {roomOpened && <Link className="btn" href="/my/classes">내 클래스 확인하기 <ArrowRight aria-hidden="true"/></Link>}
    </section>}
    {view && !view.telegramOnly && <div className="onboarding-footer"><Link href="/my/classes">내 클래스 보기</Link>{view.supportUrl && <a href={view.supportUrl} target="_blank" rel="noreferrer">고객센터 문의</a>}</div>}
  </div></main>;
}
