'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminButton, AdminInput, AdminSection } from './final/admin-system';
type State = { link: {id: string; room_version: number; revision: number; enabled: boolean} | null; counts: {paid: number; organic: number} };
export function RecruitmentLinks({period, version}: {period: string; version: number}) {
  const busy = useRef(false);
  const [state, setState] = useState<State | null>(null);
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState('');
  const [origin, setOrigin] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/conversion/links?period=${encodeURIComponent(period)}`, {cache:'no-store', signal:controller.signal})
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '조회하지 못했습니다.'); if (!controller.signal.aborted) { setState(data); setOrigin(location.origin); } })
      .catch(e => { if (!controller.signal.aborted) setMessage(e.message); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [period, refresh]);
  const change = async (enabled: boolean) => {
    if (pending || busy.current || !state) return;
    busy.current = true;
    setPending(true); setMessage('');
    try {
      const response = await fetch('/api/conversion/links', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({period,version,expected:state.link?.revision ?? 0,enabled})});
      const data = await response.json();
      if (!response.ok) { setState(null); throw new Error(data.error || '다시 불러온 뒤 시도해 주세요.'); }
      setState(data); setMessage(enabled ? '저장된 방 설정으로 링크를 활성화했습니다.' : '두 모집 링크를 중지했습니다. 클릭 이력은 유지됩니다.');
    } catch (e) { setMessage((e as Error).message); }
    finally { busy.current = false; setPending(false); }
  };
  return <AdminSection title="광고·오가닉 모집 링크" description="저장된 방 설정을 확인한 뒤 링크를 활성화하세요." bordered>
    <p>현재 저장된 방 버전 {version}을 사용합니다. 입력 중인 수정 사항은 먼저 저장해야 합니다. 링크를 공유해도 자동 발송이나 광고 게재는 시작되지 않습니다.</p>
    <AdminButton disabled={pending || !state} onClick={() => void change(true)}>저장된 방으로 링크 활성화</AdminButton>
    <AdminButton disabled={pending || !state?.link?.enabled} onClick={() => void change(false)}>모집 링크 중지</AdminButton>
    <AdminButton disabled={pending} onClick={() => { setState(null); setPending(true); setMessage(''); setRefresh(n => n + 1); }}>링크·클릭 기록 새로고침</AdminButton>
    {state?.link && <>
      <p>링크 상태: {state.link.enabled ? '활성' : '중지'} · 연결된 방 버전 {state.link.room_version}</p>
      {(['paid','organic'] as const).map(channel => <AdminInput key={channel} label={channel === 'paid' ? '광고용 모집 링크' : '오가닉용 모집 링크'} readOnly value={`${origin}/join/${state.link!.id}/${channel}`} />)}
    </>}
    {state && <p>전체 방 버전의 이동 버튼 클릭 기록 — 광고용 링크 {state.counts.paid}회 · 오가닉용 링크 {state.counts.organic}회</p>}
    <p>링크 용도를 기준으로 분류합니다. 공유·재방문·자동 요청이 섞일 수 있어 실제 광고 유입, 고유 인원, 방 입장, 신청·구매로 해석하지 않습니다. 링크 열기와 미리보기는 집계하지 않으며 분당 수집 한도 초과 시 일부 클릭은 누락될 수 있습니다.</p>
    {message && <p role="status">{message}</p>}
  </AdminSection>;
}
