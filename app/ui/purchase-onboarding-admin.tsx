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
  const [cohort, setCohort] = useState('');
  const [settings, setSettings] = useState<PurchaseOnboardingSettings>(empty);
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
    setCohort(id); setSettings(empty); setMessage(''); setError('');
    if (!id) return;
    setPending(true);
    try {
      const response = await fetch(`/api/admin/purchase-onboarding?cohort=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '설정을 불러오지 못했습니다.');
      setSettings(result.settings);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '설정을 불러오지 못했습니다.'); }
    finally { setPending(false); }
  };
  const save = async () => {
    setPending(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/purchase-onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cohort, settings }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '저장하지 못했습니다.');
      setSettings(result.settings); setMessage(settings.enabled ? '결제 후 안내 화면을 사용할 수 있습니다. 알림톡 자동 발송은 별도로 승인·설정해야 합니다.' : '설정을 저장했습니다. 결제 후 안내는 아직 꺼져 있습니다.');
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
        <p className="meta">링크는 운영자 설정에만 저장하고, 결제 완료 후 유입 경로를 선택한 수강생에게만 제공합니다.</p>
        <label>광고 방 프로필 이미지<UploadField key={`${cohort}:paid`} name="광고 방 프로필 이미지" value={settings.paidImage} image disabled={pending} onChange={value => setSettings(current => ({ ...current, paidImage: value }))} onStatusChange={state => setUploading(state === 'uploading')} /></label>
        <label>오가닉 방 프로필 이미지<UploadField key={`${cohort}:organic`} name="오가닉 방 프로필 이미지" value={settings.organicImage} image disabled={pending} onChange={value => setSettings(current => ({ ...current, organicImage: value }))} onStatusChange={state => setUploading(state === 'uploading')} /></label>
        <label className="onboarding-toggle"><input type="checkbox" checked={settings.enabled} disabled={pending} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} />결제 완료 수강생에게 안내 화면 열기</label>
        <p className="meta">알림톡은 이 체크박스로 발송되지 않습니다. 승인된 템플릿과 자동화 설정이 따로 필요합니다.</p>
        <button className="btn primary" type="button" disabled={pending || uploading} onClick={() => void save()}>설정 저장</button>
      </div>}
      {message && <p role="status" className="notice">{message}</p>}{error && <p role="alert" className="notice">{error}</p>}
    </section>
  </div></main>;
}
