'use client';

import { useEffect, useState } from 'react';
import { AdminButton, AdminDataTable, AdminEmptyState, AdminInlineError, AdminStatusBadge } from '@/features/admin-ui';
import type { liveReminderPreview } from '@/features/campus/arrival/live-reminder-server';
import type { readArrivalReminderDeliverySummary } from '@/features/campus/arrival/live-reminder-delivery';
import { kstLabel } from '@/lib/marketing-qa';
import styles from './live-reminder-intake.module.css';

type Reminder = { maskedPhone: string; consentedAt: string };
type Intake = {
  count: number;
  latest: Reminder[];
  preview: typeof liveReminderPreview;
  delivery: Awaited<ReturnType<typeof readArrivalReminderDeliverySummary>>;
};
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
  const delivery = data?.delivery;
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
          {delivery?.windowClosed
            ? <AdminStatusBadge status="completed" label="발송 시간 종료" />
            : delivery?.enabled
              ? <AdminStatusBadge status="scheduled" label="자동 발송 켜짐" />
              : <AdminStatusBadge status="paused" label="발송 꺼짐" />}
          <AdminButton type="button" variant="outline" size="sm" loading={loading} onClick={reload}>새로 불러오기</AdminButton>
        </div>
        {data ? <>
          <dl className={styles.schedule}>
            <div><dt>발송 시작{delivery?.enabled ? '' : ' · 검수안'}</dt><dd><time dateTime={data.preview.proposedSendAt}>{kstLabel(data.preview.proposedSendAt)}</time></dd></div>
            <div><dt>라이브 시작</dt><dd><time dateTime={data.preview.liveStartsAt}>{kstLabel(data.preview.liveStartsAt)}</time></dd></div>
            {delivery && <div><dt>휴대폰 번호 파기{delivery.cleanup ? ' 완료' : ' 예정'}</dt><dd><time dateTime={delivery.cleanup?.purged_at ?? delivery.purgeAt}>{kstLabel(delivery.cleanup?.purged_at ?? delivery.purgeAt)}</time></dd></div>}
          </dl>
          <div className={styles.message}>
            <h3>문자 내용 미리보기</h3>
            <p>{data.preview.message}</p>
          </div>
          {delivery ? <p className="meta mt8 mb24" role="status">
            발송 업체 접수 {delivery.accepted.toLocaleString('ko-KR')}건 · 전송 성공 {delivery.delivered.toLocaleString('ko-KR')}건 · 실패 {delivery.failed.toLocaleString('ko-KR')}건 · 결과 대기 {delivery.pending.toLocaleString('ko-KR')}건 · 결과 미확인 {delivery.unconfirmed.toLocaleString('ko-KR')}건 · 발송 시간 만료 {(delivery.skipped + (delivery.cleanup?.eligible_unsent_count ?? 0)).toLocaleString('ko-KR')}건
          </p> : <p className="meta mt8 mb24">발송 시각과 문구를 확인할 수 있어요. 자동 발송은 꺼져 있습니다.</p>}
          <h3>발송 대상</h3>
          <p className="meta mt8 mb24">웰컴 라운지에서 문샷 라이브 안내 문자 수신에 동의한 번호만 포함됩니다. 같은 번호는 한 번만 집계하며 표에는 최근 50건까지 표시합니다.</p>
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
