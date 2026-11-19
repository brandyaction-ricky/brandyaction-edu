'use client';

import { useEffect, useState } from 'react';
import { AdminButton, AdminDataTable, AdminEmptyState, AdminInlineError, AdminStatusBadge } from '@/features/admin-ui';
import { liveEvent } from '@/features/campus/arrival/model';
import { kstLabel } from '@/lib/marketing-qa';

type Reminder = { maskedPhone: string; consentedAt: string };
type Intake = { count: number; latest: Reminder[] };
type View = { data: Intake } | { error: true };

export function LiveReminderIntake() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch('/api/admin/crm/live-reminders', { cache: 'no-store', signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 403 || response.status === 404) {
          setView(null);
        } else if (response.ok) {
          const data: Intake = await response.json();
          if (!controller.signal.aborted) setView({ data });
        } else if (response.status === 503) {
          setView({ error: true });
        }
      } catch {
        if (!controller.signal.aborted) setView(current => current ? { error: true } : null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [refresh]);

  if (!view) return null;

  const data = 'data' in view ? view.data : null;
  function reload() {
    setLoading(true);
    setRefresh(previous => previous + 1);
  }

  return (
    <details className="panel admin-crm-settings mb24">
      <summary>문샷 무료 라이브 알림 신청 <span>{data ? `접수 ${data.count.toLocaleString('ko-KR')}건` : '접수 확인 필요'}</span></summary>
      <div className="pad">
        <div className="between">
          <h2>{kstLabel(liveEvent.startsAt)}</h2>
          <AdminStatusBadge status="paused" label="발송 꺼짐" />
          <AdminButton type="button" variant="outline" size="sm" loading={loading} onClick={reload}>새로 불러오기</AdminButton>
        </div>
        <p className="meta mt8 mb24">이 행사에 한해 알림을 받겠다고 동의한 신청입니다. 최근 50건까지 표시합니다.</p>
        {data ? <AdminDataTable label="최근 라이브 알림 신청" sticky={false}>
          <thead><tr><th scope="col">휴대폰 번호</th><th scope="col">동의 시각</th></tr></thead>
          <tbody>
            {data.latest.map(({ maskedPhone, consentedAt }, index) => (
              <tr key={`${consentedAt}-${maskedPhone}-${index}`}>
                <td>{maskedPhone}</td>
                <td><time dateTime={consentedAt}>{kstLabel(consentedAt)}</time></td>
              </tr>
            ))}
            {data.latest.length === 0 && <tr><td colSpan={2}><AdminEmptyState compact title="아직 알림 신청이 없습니다." /></td></tr>}
          </tbody>
        </AdminDataTable> : <AdminInlineError>라이브 알림 신청을 불러오지 못했습니다.</AdminInlineError>}
      </div>
    </details>
  );
}
