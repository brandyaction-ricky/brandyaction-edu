'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { AppInstallCard, AppInstallProvider } from './final/app-install';
import { TELEGRAM_ANDROID_INSTALL_URL, TELEGRAM_IOS_INSTALL_URL } from '@/lib/purchase-onboarding';
import { onboardingStep, orientationLabel, type OnboardingProgress } from '@/lib/purchase-onboarding-progress';

type Props = {
  orderId: string; itemName: string; roomName: string; supportUrl: string; progress: OnboardingProgress;
  pending: boolean; error: string; manualUrl: string;
  confirm: (body: Record<string, unknown>) => Promise<void>; refresh: () => Promise<void>; openRoom: () => Promise<void>;
};
const labels = ['텔레그램 입장', '앱 설치', 'OT 일정 확인', '첫 학습 · 댓글'];
export function PurchaseOnboardingChecklist(props: Props) {
  const { progress, pending, error, refresh: refreshProgress } = props;
  const active = onboardingStep(progress);
  const [selected, setSelected] = useState<number | null>(null), [newTelegram, setNewTelegram] = useState(false);
  const [comment, setComment] = useState(progress.comment);
  const step = selected === null ? Math.min(active, 3) : Math.min(selected, active, 3);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void refreshProgress(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [refreshProgress]);
  const confirm = async (body: Record<string, unknown>) => { await props.confirm(body); setSelected(null); };
  return <AppInstallProvider enabled><main className="edu-front purchase-onboarding purchase-onboarding-user">
    <header className="onboarding-header"><div className="wrap onboarding-header-inner"><Link href="/" className="onboarding-brand"><strong>Brandy Action</strong><span>EDU</span></Link><Link href="/my/classes">내 클래스</Link></div></header>
    <div className="wrap onboarding-shell"><div className="onboarding-title-block"><h1>{props.itemName} 시작 준비</h1><p>4단계를 마치면 수업 준비 끝! 진행 상황은 자동으로 저장돼요.</p></div>
      <ol className="onboarding-steps onboarding-four-steps" aria-label="시작 준비 단계">{labels.map((label, index) => <li key={label} className={index < active ? 'complete' : index === step ? 'active' : ''} aria-current={index === step ? 'step' : undefined}><button type="button" disabled={pending || index > active} onClick={() => setSelected(index)}><span>{index + 1}단계{index < active ? ' · 완료' : ''}</span><strong>{label}</strong></button></li>)}</ol>
      {error && <p role="alert" className="notice">{error} <button className="btn small" disabled={pending} onClick={() => void props.refresh()}>다시 확인</button></p>}
      {active === 4 && <section className="onboarding-panel onboarding-done" role="status"><Check aria-hidden="true"/><h2>시작 준비를 모두 마쳤어요!</h2><p>텔레그램 입장, 앱 설치, OT 일정 확인, 운영 가이드 학습과 댓글까지 완료했습니다.</p><Link className="btn primary" href="/my/classes">내 클래스에서 학습 이어가기 <ArrowRight aria-hidden="true"/></Link></section>}
      {step === 0 && <section className="onboarding-panel"><p className="eyebrow">1단계</p><h2>{props.roomName}에 입장해 주세요</h2><p>수업 공지와 질문, 특강 안내를 텔레그램에서 확인해요.</p><div className="onboarding-options"><button aria-pressed={!newTelegram} onClick={() => setNewTelegram(false)}>이미 텔레그램을 사용해요</button><button aria-pressed={newTelegram} onClick={() => setNewTelegram(true)}>텔레그램이 처음이에요</button></div>
        {newTelegram && <div className="onboarding-instruction"><p>휴대폰에 텔레그램을 설치하고 가입한 뒤 돌아와 주세요.</p><div className="onboarding-install-actions"><a className="btn" href={TELEGRAM_IOS_INSTALL_URL} target="_blank" rel="noopener noreferrer">iPhone 앱 설치</a><a className="btn" href={TELEGRAM_ANDROID_INSTALL_URL} target="_blank" rel="noopener noreferrer">Android 앱 설치</a></div></div>}
        <button className="btn primary mt24" disabled={pending} aria-label="텔레그램 공지방 입장" onClick={() => void props.openRoom()}>공지방 입장 <ArrowRight aria-hidden="true"/></button>
        {props.manualUrl && <p>새 창이 열리지 않았다면 <a href={props.manualUrl} target="_blank" rel="noopener noreferrer">여기에서 공지방 열기</a>를 눌러 주세요.</p>}
        <p>방을 여는 것만으로는 입장이 완료되지 않아요. 텔레그램에서 참여한 뒤 확인해 주세요.</p><label className="onboarding-confirm"><input type="checkbox" checked={progress.telegram} disabled={pending || progress.telegram} onChange={() => void confirm({ step: 'telegram' })}/><span><strong>공지방에 입장했어요</strong><small>확인하면 앱 설치로 이어집니다.</small></span></label>
      </section>}
      {step === 1 && <section className="onboarding-panel"><p className="eyebrow">2단계</p><h2>브랜디에듀 앱을 설치해 주세요</h2><p>텔레그램과 별개로, 수업을 여는 브랜디에듀 아이콘을 추가해요. 설치 후 이 안내로 돌아와 확인해 주세요.</p><AppInstallCard settings/><label className="onboarding-confirm"><input type="checkbox" checked={progress.app} disabled={pending || progress.app} onChange={() => void confirm({ step: 'app' })}/><span><strong>브랜디에듀 아이콘을 추가하고 열어 봤어요</strong><small>다른 기기에 설치했다면 그 기기에서 열리는지 확인해 주세요.</small></span></label></section>}
      {step === 2 && <section className="onboarding-panel"><p className="eyebrow">3단계</p><h2>OT 일정을 확인해 주세요</h2><p>지금은 일정을 확인하는 단계예요. OT 시청은 필요하지 않아요.</p>{progress.orientationAt ? <><p className="onboarding-schedule"><strong>{orientationLabel(progress.orientationAt)}</strong><br/><small>한국 시간 기준</small></p><label className="onboarding-confirm"><input type="checkbox" checked={progress.orientation} disabled={pending || progress.orientation} onChange={() => void confirm({ step: 'orientation', orientationAt: progress.orientationAt })}/><span><strong>OT 일정을 확인했어요</strong></span></label></> : <p className="notice">운영자가 OT 일정을 준비 중입니다. 일정이 등록되면 여기에서 이어서 확인할 수 있어요.</p>}</section>}
      {step === 3 && <section className="onboarding-panel"><p className="eyebrow">4단계</p><h2>운영 가이드와 규정을 읽고 댓글을 남겨 주세요</h2>{progress.lesson ? <><p>{progress.lesson.title}</p><a className="btn" href={progress.lesson.url} target="_blank" rel="noopener noreferrer">운영 가이드 학습 열기 ↗</a><p>새 창에서 안내와 규정을 읽고 ‘학습 완료하기’를 누른 뒤 돌아와 주세요.</p><div className="onboarding-learning-status"><strong>{progress.lesson.completed ? '운영 가이드 학습 완료' : '아직 학습 완료가 확인되지 않았어요'}</strong><button className="btn small" disabled={pending} onClick={() => void props.refresh()}>학습 완료 다시 확인</button></div><label className="onboarding-comment">확인 댓글<textarea value={comment} maxLength={1000} rows={4} disabled={pending} onChange={event => setComment(event.target.value)} placeholder="운영 가이드와 규정을 읽고 확인한 내용을 남겨 주세요."/></label><p className="meta">댓글은 본인과 운영자만 확인합니다. {comment.length}/1,000자</p>{progress.comment && <p role="status">저장한 댓글: {progress.comment}</p>}<button className="btn primary" disabled={pending || !progress.lesson.completed || !comment.trim()} onClick={() => void confirm({ step: 'learning', lessonId: progress.lesson!.id, comment })}>{pending ? '저장 중…' : progress.learning ? '댓글 수정 저장' : '댓글 저장하고 시작 준비 완료'}</button>{!progress.lesson.completed && <p>운영 가이드 학습을 완료하면 댓글을 저장할 수 있어요.</p>}</> : <p className="notice">첫 학습을 아직 열 수 없습니다. 운영자가 학습 설정과 수강 권한을 확인하면 이어서 진행할 수 있어요.</p>}</section>}
      <footer className="onboarding-footer"><button className="btn small" disabled={pending} onClick={() => void props.refresh()}>진행 상황 다시 확인</button>{props.supportUrl && <a href={props.supportUrl} target="_blank" rel="noopener noreferrer">진행이 어려우면 운영자에게 문의하기</a>}</footer>
    </div></main></AppInstallProvider>;
}
