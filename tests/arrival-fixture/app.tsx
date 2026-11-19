import {ARRIVAL_CALENDAR_FILE} from '../../features/campus/arrival/model';
import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WebinarAdmin} from '../../features/campus/webinar/admin';
import {ArrivalExperience} from '../../features/campus/arrival/experience';
import {DEFAULT_ARRIVAL, validateArrivalConfig, type ArrivalConfig} from '../../features/campus/arrival/config';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../../app/ui/final/tokens.css';
import '../../app/ui/final/frontend.css';
import '../../app/ui/final/admin.css';
import '../../app/ui/final/integration.css';
import '../../features/admin-ui/styles/admin-system.css';

const params = new URLSearchParams(location.search);
const targets = {arrival: '/arrival', 'webinar-admin': '/webinar-admin', 'saved-preview': '/saved-preview'} as const;
type Target = keyof typeof targets;
const initialTarget = params.get('target') as Target;

function SavedPreview() {
  const [config, setConfig] = useState<ArrivalConfig | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/arrival-fixture/saved?event=' + encodeURIComponent(params.get('event') || 'arrival-synthetic-qa'), {signal: controller.signal, cache: 'no-store'})
      .then(async response => {const data = await response.json(); if (!response.ok) throw Error(data.error); return validateArrivalConfig(data.arrival);})
      .then(setConfig).catch(cause => {if (cause.name !== 'AbortError') setError(cause.message);});
    return () => controller.abort();
  }, []);
  if (error) return <p role="alert" style={{padding: 32}}>{error}</p>;
  if (!config) return <p role="status" style={{padding: 32}}>로컬 메모리에 저장한 체험을 불러옵니다…</p>;
  return <ArrivalExperience config={config} persistenceKey={null} preview/>;
}

function Frame() {
  const capture = params.get('capture') === '1';
  const [target, setTarget] = useState<Target>(Object.hasOwn(targets, initialTarget) ? initialTarget : 'arrival');
  const [mobile, setMobile] = useState(params.get('size') === 'mobile');
  const [revision, setRevision] = useState(0);
  const width = mobile ? 390 : 1280, height = mobile ? 700 : 720;
  const src = targets[target] + (target === 'saved-preview' ? '?event=' + encodeURIComponent(params.get('event') || 'arrival-synthetic-qa') : '');
  return <main style={{minHeight: '100vh', background: '#e8ebef', color: '#17202a', fontFamily: 'var(--font-sans, sans-serif)'}}>
    <header id="arrival-fixture-toolbar" style={{position: 'static', display: capture ? 'none' : 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '12px 16px', boxSizing: 'border-box', background: '#fff', borderBottom: '1px solid #cfd3d8', flexWrap: 'wrap'}}>
      <strong>로컬 합성 QA · 실제 화면 크기 검수</strong>
      <label>검수 화면 <select aria-label="검수 화면" value={target} onChange={event => setTarget(event.target.value as Target)}><option value="arrival">모집 체험</option><option value="webinar-admin">웰컴존 관리자</option><option value="saved-preview">저장된 체험</option></select></label>
      <button type="button" aria-pressed={!mobile} onClick={() => setMobile(false)}>PC · 1280 × 720</button>
      <button type="button" aria-pressed={mobile} onClick={() => setMobile(true)}>모바일 · 390 × 700</button>
      <button type="button" onClick={() => setRevision(value => value + 1)}>검수 화면 다시 열기</button>
      <small>실제 계정·DB·운영 연결 없음</small>
    </header>
    <div style={{padding: capture ? 0 : 16, overflow: 'auto'}}>
      <iframe key={`${target}-${revision}`} title="모집 체험 검수 화면" src={src} width={width} height={height} style={{display: 'block', width, height, margin: capture ? 0 : '0 auto', border: capture ? 0 : '1px solid #cfd3d8', borderRadius: capture ? 0 : mobile ? 18 : 8, background: '#fff'}}/>
    </div>
  </main>;
}

const path = location.pathname;
createRoot(document.getElementById('root')!).render(
  path === '/frame' ? <Frame/> :
  path === '/webinar-admin' || path === '/admin/campus/webinars' ? <><div style={{background: '#fff2d5', color: '#6c4a15', padding: 12, textAlign: 'center', fontFamily: 'var(--font-sans, sans-serif)'}}>로컬 합성 QA · 저장은 이 서버 메모리에만 반영됩니다. 실제 행사·수강생·DB는 변경하지 않습니다.</div><WebinarAdmin arrivalDraftOnly={params.get('draftOnly') === '1'}/></> :
  path === '/saved-preview' || path === '/experience/moonshot' && params.has('event') ? <SavedPreview/> :
  <ArrivalExperience config={DEFAULT_ARRIVAL} persistenceKey="moonshot:arrival:synthetic-local-qa:v1" calendarFileHref={ARRIVAL_CALENDAR_FILE} liveReminderEnabled/>,
);
