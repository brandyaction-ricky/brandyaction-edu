'use client';
import { useEffect, useRef, useState } from 'react';
import { EMPTY_RECRUITMENT_ROOMS, recruitmentPeriod, recruitmentRooms, type RecruitmentRooms } from '@/lib/recruitment-rooms';
import { RecruitmentLinks } from './recruitment-links';
import { createMutationGate } from '@/lib/mutation-gate';
import { AdminButton, AdminInput, AdminSection, AdminSelect } from './final/admin-system';

export function RecruitmentRoomSettings() {
  const [period, setPeriod] = useState('moonshot-4');
  const [settings, setSettings] = useState<RecruitmentRooms>(EMPTY_RECRUITMENT_ROOMS);
  const [version, setVersion] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const reading = useRef<AbortController | null>(null);
  const gate = useRef(createMutationGate<{ draft: { version: number } }>());
  useEffect(() => { active.current = true; return () => { active.current = false; reading.current?.abort(); }; }, []);
  const load = async () => {
    let key: string;
    try { key = recruitmentPeriod(period); } catch (e) { setMessage((e as Error).message); return; }
    reading.current?.abort();
    const controller = new AbortController(); reading.current = controller;
    setPending(true); setVersion(null); setSettings(EMPTY_RECRUITMENT_ROOMS); setMessage('');
    try {
      const response = await fetch(`/api/conversion/rooms?period=${encodeURIComponent(key)}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '불러오지 못했습니다.');
      if (!active.current || controller.signal.aborted) return;
      setVersion(data.draft?.version ?? 0);
      setSettings(data.draft ? recruitmentRooms(data.draft.settings) : EMPTY_RECRUITMENT_ROOMS);
      setMessage(data.draft ? '저장된 방 설정을 불러왔습니다.' : '새 모집 구분입니다. 방 주소를 입력하고 저장하세요.');
    } catch (e) { if (active.current && !controller.signal.aborted) { setVersion(null); setMessage((e as Error).message); } }
    finally { if (active.current && !controller.signal.aborted) setPending(false); }
  };
  const save = async () => {
    setPending(true); setMessage('');
    try {
      const clean = recruitmentRooms(settings);
      const result = await gate.current({ period: recruitmentPeriod(period), settings: clean, expected_version: version }, async body => {
        const response = await fetch('/api/conversion/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) throw Object.assign(new Error(data.error || '저장하지 못했습니다.'), { status: response.status });
        return data;
      });
      if (!active.current) return;
      setSettings(clean); setVersion(result.draft.version);
      setMessage('방 설정을 저장했습니다. 고객 페이지 연결·입장 측정·메시지 발송은 아직 시작되지 않았습니다.');
    } catch (e) {
      if (!active.current) return;
      if ([401,403,409].includes((e as { status?: number }).status || 0)) { setVersion(null); setSettings(EMPTY_RECRUITMENT_ROOMS); }
      setMessage((e as Error).message);
    } finally { if (active.current) setPending(false); }
  };
  return <AdminSection title="모집별 카톡방 설정" description="같은 방을 유지해도 모집 구분은 따로 관리합니다." bordered>
    <p>오가닉은 누적 운영합니다. 광고 방은 모집마다 새 방 또는 기존 방 재사용을 선택할 수 있으며, 미정으로 저장해도 됩니다.</p>
    <AdminInput label="모집 구분 코드" value={period} disabled={pending} onChange={e => { setPeriod(e.target.value); setVersion(null); setSettings(EMPTY_RECRUITMENT_ROOMS); setMessage('모집 구분을 바꿨습니다. 먼저 불러오기를 눌러 주세요.'); }} helper="예: moonshot-4. 다음 모집은 새 코드를 쓰고 같은 방 주소를 다시 연결할 수 있습니다. 무료 교육 기수와는 별개입니다." />
    <AdminButton disabled={pending} onClick={() => void load()}>모집 방 설정 불러오기</AdminButton>
    <fieldset className="funnel-selection" disabled={pending || version === null}>
      <legend>모집에 사용할 방</legend>
      <AdminInput label="모집 이름" maxLength={80} value={settings.label} onChange={e => setSettings(s => ({ ...s, label: e.target.value }))} />
      <AdminInput label="오가닉 오픈채팅방 주소" value={settings.organicUrl} onChange={e => setSettings(s => ({ ...s, organicUrl: e.target.value }))} />
      <AdminInput label="광고 오픈채팅방 주소" value={settings.paidUrl} onChange={e => setSettings(s => ({ ...s, paidUrl: e.target.value }))} />
      <AdminSelect label="광고 방 운영 방식" value={settings.paidMode} onChange={e => setSettings(s => ({ ...s, paidMode: e.target.value as RecruitmentRooms['paidMode'] }))}>
        <option value="undecided">미정</option><option value="new">이번 모집에 새 방</option><option value="reuse">기존 방 재사용</option>
      </AdminSelect>
    </fieldset>
    <AdminButton disabled={pending || version === null} onClick={() => void save()}>모집 방 설정 저장</AdminButton>
    {version !== null && <p>방 설정 버전 {version} · {period}</p>}
    {message && <p role="status">{message}</p>}
    {version !== null && version > 0 && <RecruitmentLinks key={`${period}:${version}`} period={period} version={version} />}
    <p className="conversion-muted">다음 모집에 방을 바꿔도 이전 모집 주소와 저장 이력은 유지됩니다. 월별 집계·방 입장 확인은 별도 연결이 필요합니다. 방 운영 방식 선택만으로 카톡방을 생성하거나 폐쇄하지 않습니다.</p>
  </AdminSection>;
}
