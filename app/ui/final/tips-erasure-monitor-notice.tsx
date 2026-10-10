'use client';

import { useEffect, useState } from 'react';
import './tips-erasure-monitor-notice.css';

type Snapshot = {
  state: string;
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  pendingOverdueRequests?: number | null;
};
const labels: Record<string, string> = {
  disabled: '삭제 기한 점검을 활성화하기 전입니다.',
  not_started: '삭제 기한 점검 기록이 없습니다. 예약 실행을 확인해 주세요.',
  stale: '최근 90분 동안 삭제 기한 점검이 실행되지 않았습니다.',
  check_failed: '마지막 삭제 기한 점검이 실패했습니다.',
  check_unavailable: '삭제 기한 점검 상태를 읽지 못했습니다.',
  configuration_required: '삭제 기한 점검 환경 설정을 확인해 주세요.',
  overdue: '기한이 지났지만 삭제 증거가 도착하지 않은 요청이 있습니다.',
  ok: '최근 점검에서 기한이 지난 미확인 요청은 없습니다.',
};

export function TipsErasureMonitorNotice() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch('/api/admin/tips-erasure-monitor', { cache: 'no-store' });
        const data = await response.json();
        if (active) setSnapshot(data && typeof data.state === 'string' ? data : { state: 'check_unavailable' });
      } catch { if (active) setSnapshot({ state: 'check_unavailable' }); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5 * 60_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!snapshot || snapshot.state === 'disabled') return null;
  const warning = snapshot.state !== 'ok';
  return <section className={`panel tips-erasure-monitor ${warning ? 'tips-erasure-monitor--warning' : ''}`}
    role={warning ? 'alert' : 'status'} aria-label="TIPS 삭제 기한 점검">
    <strong>TIPS 삭제 기한 점검</strong>
    <p>{labels[snapshot.state] ?? labels.check_unavailable}
      {snapshot.state === 'overdue' && typeof snapshot.pendingOverdueRequests === 'number'
        ? ` (${snapshot.pendingOverdueRequests}개 소비자–요청 쌍)` : ''}</p>
    {snapshot.lastAttemptAt && <small>마지막 시도 {new Date(snapshot.lastAttemptAt).toLocaleString('ko-KR')}</small>}
    <small>이 상태는 삭제 완료 증명이 아닙니다.</small>
  </section>;
}
