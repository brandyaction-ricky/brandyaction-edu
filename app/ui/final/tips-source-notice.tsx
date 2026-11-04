'use client';
import { useEffect, useState } from 'react';
import type { SourceSnapshot } from '@/lib/edu-tips-source-status';
import './tips-erasure-monitor-notice.css';
type Snapshot = Partial<Omit<SourceSnapshot, 'state'>> & { state: string };
const labels: Record<string, string> = {
  attention: '등록·자료 준비·철회 작업 중 확인이 필요한 항목이 있습니다.',
  pending: '등록·자료 준비·철회 작업을 처리하고 있습니다.',
  paused: '고객별 분석 연결을 활성화하기 전입니다.',
  idle: '현재 대기 중인 연결 작업이 없습니다.',
  check_unavailable: '연결 작업 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.',
};
export function TipsSourcePanel({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.state === 'disabled') return null;
  const warning = snapshot.state === 'attention' || !(snapshot.state in labels) || snapshot.state === 'check_unavailable';
  return <section className={`panel tips-erasure-monitor ${warning ? 'tips-erasure-monitor--warning' : ''}`} role={warning ? 'alert' : 'status'} aria-label="고객별 분석 연결 상태">
    <strong>고객별 분석 연결</strong>
    <p>{labels[snapshot.state] ?? labels.check_unavailable}</p>
    {typeof snapshot.registration_pending === 'number' && <small>등록 대기 {snapshot.registration_pending}건 · 자료 준비 {snapshot.projection_pending}건 · 철회 확인 {snapshot.withdrawal_pending}건</small>}
    {typeof snapshot.unclassified === 'number' && snapshot.unclassified > 0 && <small>기존 삭제 요청의 원래 적용 기준 확인이 필요합니다. ({snapshot.unclassified}건)</small>}
    <small>연결 상태는 고객별 전송 활성화나 삭제 완료를 뜻하지 않습니다.</small>
  </section>;
}
export function TipsSourceNotice() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/admin/tips-source-status', { cache: 'no-store' });
        if (response.status === 401 || response.status === 403) { if (active) setSnapshot({ state: 'disabled' }); return; }
        const data = await response.json();
        if (active) setSnapshot(data && typeof data.state === 'string' ? data : { state: 'check_unavailable' });
      } catch { if (active) setSnapshot({ state: 'check_unavailable' }); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 5 * 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return snapshot ? <TipsSourcePanel snapshot={snapshot} /> : null;
}
