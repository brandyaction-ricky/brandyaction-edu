'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UploadField } from '@/app/ui/editor-fields';
import type { PurchaseOnboardingSettings } from '@/lib/purchase-onboarding';
import './purchase-onboarding.css';

type Cohort = { id: string; name: string; courses: { title: string } | { title: string }[] | null };
const empty: PurchaseOnboardingSettings = { roomName: '', inviteUrl: '', paidImage: '', organicImage: '', enabled: false };

export function PurchaseOnboardingAdmin() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [lessons, setLessons] = useState<{ id: string; title: string }[]>([]);
  const [comments, setComments] = useState<{ order_id: string; comment: string; confirmed_at: string }[]>([]);
  const [cohort, setCohort] = useState('');
  const [settings, setSettings] = useState<PurchaseOnboardingSettings>(empty);
  const [telegramOnly, setTelegramOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    void fetch('/api/admin/purchase-onboarding', { cache: 'no-store' }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '기수를 불러오지 못했습니다.');
      setCohorts(result.cohorts || []);
    }).catch(cause => setError(cause instanceof Error ? cause.message : '기수를 불러오지 못했습니다.'));
  }, []);
  const load = async (id: string) => {
    setCohort(id); setSettings(empty); setLessons([]); setComments([]); setTelegramOnly(false); setMessage(''); setError('');
    if (!id) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/purchase-onboarding?cohort=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '설정을 불러오지 못했습니다.');
      setSettings(result.settings); setLessons(result.lessons || []); setComments(result.comments || []);
      setTelegramOnly(result.telegramOnly === true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '설정을 불러오지 못했습니다.'); }
    finally { setPending(false); }
  };
  const save = async () => {
    setPending(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/purchase-onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cohort, settings }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '저장하지 못했습니다.');
      setSettings(result.settings); setMessage(settings.enabled ? '결제 완료 수강생에게 시작 안내를 표시합니다.' : '설정을 저장했습니다. 결제 후 안내는 아직 꺼져 있습니다.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.'); }
    finally { setPending(false); }
  };
  return <main className="edu-front purchase-onboarding"><div className="wrap narrow">
    <Link href="/admin/products">← 상품 관리</Link><p className="eyebrow mt24">PURCHASE ONBOARDING</p><h1>결제 후 안내 설정</h1>
    <p className="lead">기수를 선택하고 텔레그램 방 정보를 등록하세요. 이미지는 나중에 추가할 수 있습니다.</p>
    <section className="onboarding-panel"><label>안내할 기수<select value={cohort} disabled={pending} onChange={event => void load(event.target.value)}><option value="">기수를 선택하세요</option>{cohorts.map(item => <option key={item.id} value={item.id}>{(Array.isArray(item.courses) ? item.courses[0]?.title : item.courses?.title) || '상품'} · {item.name}</option>)}</select></label>
      {cohort && <div className="onboarding-admin-fields">
        <label>텔레그램 방 이름<input value={settings.roomName} disabled={pending} maxLength={80} onChange={event => setSettings(current => ({ ...current, roomName: event.target.value }))} /></label>
        <label>텔레그램 초대 링크<input type="url" value={settings.inviteUrl} disabled={pending} placeholder="https://t.me/+..." onChange={event => setSettings(current => ({ ...current, inviteUrl: event.target.value }))} /></label>
        <p className="meta">링크는 운영자 설정에만 저장하고, 결제 완료가 확인된 수강생에게만 제공합니다.</p>
        {!telegramOnly && <><label>광고 방 프로필 이미지<UploadField key={`${cohort}:paid`} name="광고 방 프로필 이미지" value={settings.paidImage} image disabled={pending} onChange={value => setSettings(current => ({ ...current, paidImage: value }))} onStatusChange={state => setUploading(state === 'uploading')} /></label>
        <label>오가닉 방 프로필 이미지<UploadField key={`${cohort}:organic`} name="오가닉 방 프로필 이미지" value={settings.organicImage} image disabled={pending} onChange={value => setSettings(current => ({ ...current, organicImage: value }))} onStatusChange={state => setUploading(state === 'uploading')} /></label></>}
        {telegramOnly && <p className="meta">문샷 챌린지 4기는 웹 유입 설문 없이 텔레그램 설치·가입·공지방 입장을 안내합니다.</p>}
        <label>OT 일정 · 한국 시간<input type="datetime-local" value={(settings.orientationAt || '').slice(0,16)} disabled={pending} onChange={event => setSettings(current => ({ ...current, orientationAt: event.target.value ? `${event.target.value}:00+09:00` : '' }))}/></label>
        <p className="meta">수강생은 시청 없이 이 일정을 확인합니다. 일정이 바뀌면 다시 확인해야 합니다.</p>
        <label>첫 학습 · 운영 가이드 및 규정<select value={settings.firstLessonId || ''} disabled={pending} onChange={event => setSettings(current => ({ ...current, firstLessonId: event.target.value }))}><option value="">학습 선택</option>{lessons.map(lesson => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}</select></label>
        <p className="meta">수강생이 바로 열 수 있는 첫 학습을 선택하고, 커리큘럼에서 해당 주차·학습을 이 기수에 공개해 주세요. 실제 학습 완료 후 확인 댓글을 저장합니다.</p>
        <label className="onboarding-toggle"><input type="checkbox" checked={settings.checklistEnabled === true} disabled={pending} onChange={event => setSettings(current => ({ ...current, checklistEnabled: event.target.checked }))}/>4단계 시작 준비 사용 · 텔레그램 → 앱 설치 → OT 일정 → 첫 학습·댓글</label>
        {telegramOnly && <p className="meta">이 기수는 4단계 안내를 사용합니다. OT 일정과 첫 학습을 반드시 등록해 주세요.</p>}
        <label className="onboarding-toggle"><input type="checkbox" checked={settings.enabled} disabled={pending} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} />결제 완료 수강생에게 안내 화면 열기</label>
        {!telegramOnly && <p className="meta">알림톡은 이 체크박스로 발송되지 않습니다. 승인된 템플릿과 자동화 설정이 따로 필요합니다.</p>}
        <button className="btn primary" type="button" disabled={pending || uploading} onClick={() => void save()}>설정 저장</button>
      </div>}
      {comments.length > 0 && <section className="onboarding-panel"><h2>첫 학습 확인 댓글 · 최근 100건</h2>{comments.map(item => <article key={item.order_id}><p className="meta">주문 {item.order_id} · {new Date(item.confirmed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.comment}</p></article>)}</section>}
      {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="notice">{error}</p>}
    </section>
  </div></main>;
}
