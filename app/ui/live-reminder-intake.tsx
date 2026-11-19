'use client';

import { useEffect, useState } from 'react';
import { AdminButton, AdminDataTable, AdminEmptyState, AdminInlineError, AdminStatusBadge } from '@/features/admin-ui';
import type { liveReminderPreview } from '@/features/campus/arrival/live-reminder-server';
import { kstLabel } from '@/lib/marketing-qa';
import styles from './live-reminder-intake.module.css';

type Reminder = { maskedPhone: string; consentedAt: string };
type Intake = { count: number; latest: Reminder[]; preview: typeof liveReminderPreview };
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
    <details id="moonshot-live-reminder" className="panel admin-crm-settings mb24">
      <summary>문샷 무료 라이브 알림 신청 <span>{data ? `발송 대상 ${data.count.toLocaleString('ko-KR')}명` : '대상 확인 필요'}</span></summary>
      <div className="pad">
        <div className={styles.header}>
          <h2>12월 7일 라이브 안내 문자</h2>
          <AdminStatusBadge status="paused" label="발송 꺼짐" />
          <AdminButton type="button" variant="outline" size="sm" loading={loading} onClick={reload}>새로 불러오기</AdminButton>
        </div>
        {data ? <>
          <dl className={styles.schedule}>
            <div><dt>발송 시각 · 검수안</dt><dd><time dateTime={data.preview.proposedSendAt}>{kstLabel(data.preview.proposedSendAt)}</time></dd></div>
            <div><dt>라이브 시작</dt><dd><time dateTime={data.preview.liveStartsAt}>{kstLabel(data.preview.liveStartsAt)}</time></dd></div>
          </dl>
          <div className={styles.message}>
            <h3>문자 내용 미리보기</h3>
            <p>{data.preview.message}</p>
          </div>
          <p className="meta mt8 mb24">미리보기에서 발송 시각과 문구를 확인할 수 있어요. 실제 발송 예약은 생성되지 않습니다.</p>
          <h3>발송 대상</h3>
          <p className="meta mt8 mb24">웰컴 라운지에서 이번 라이브 안내 문자 1회 수신에 동의한 번호만 포함됩니다. 같은 번호는 한 번만 집계하며 표에는 최근 50건까지 표시합니다.</p>
          <AdminDataTable label="라이브 안내 문자 발송 대상" sticky={false}>
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
          </AdminDataTable>
        </> : <AdminInlineError>라이브 알림 신청을 불러오지 못했습니다.</AdminInlineError>}
      </div>
    </details>
  );
}
