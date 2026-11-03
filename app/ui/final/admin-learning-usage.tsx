'use client';
import { useEffect, useState } from 'react';
import { AdminLoadingState, AdminInlineError, AdminEmptyState, AdminPagination } from '@/features/admin-ui';
import { learningUsage, usageLabels, type UsageItem, type UsageReport } from '@/lib/learning-usage';
import './admin-learning-usage.css';

const time = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음';
function Evidence({ items, historical = false }: { items: UsageItem[]; historical?: boolean }) {
  return <ul className="alu-evidence">{items.map(item => <li key={`${item.type}:${item.id}`}>
    <b>{item.title || '구성에서 제외된 항목'}</b><span>{usageLabels[item.type]} · {item.firstUsedAt ? '이용 기록 있음' : '기록 없음'}{item.available === false && !historical ? ' · 아직 공개되지 않음' : ''}</span>
    {item.firstUsedAt && <><span>첫 기록 · {time(item.firstUsedAt)}</span><span>최근 기록 · {time(item.lastUsedAt)} · 요청 {item.requests}회 (이용률에는 1개로 계산)</span><small>{item.type === 'vod_complete' ? '학습 완료 기록 기준' : item.type === 'material_download' ? '다운로드 주소 발급 기준 · 파일 저장 완료 여부는 확인하지 않습니다.' : '입장·열람 링크를 연 기록 · 실제 시청 시간은 확인하지 않습니다.'}{item.source === 'legacy_record' ? ' · 이전 기록' : item.source === 'lesson_progress_backfill' ? ' · 기존 학습 완료 내역에서 가져온 기록' : ''}</small></>}
  </li>)}</ul>;
}
export function AdminLearningUsage({ member }: { member: string }) {
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data?: UsageReport; error?: string } | null>(null);
  const key = `${member}:${page}:${retry}`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/learning-usage?${new URLSearchParams({ member, page: String(page) })}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '이용 기록을 불러오지 못했습니다.');
      if (!controller.signal.aborted) setState({ key, data });
    }).catch(error => { if (!controller.signal.aborted) setState({ key, error: error.message }); });
    return () => controller.abort();
  }, [member, page, key]);
  const current = state?.key === key ? state : null;
  return <section className="alu-panel" aria-label="수강 이용 기록">
    <div className="alu-heading"><h3>수강 이용 기록</h3><button type="button" className="btn small" onClick={() => setRetry(value => value + 1)}>이용 기록 새로고침</button></div>
    <p className="notice">참고 이용률은 현재 등록된 전체 구성으로 계산합니다. 구매 당시 약속한 구성과 다를 수 있어 환불을 자동 판정하지 않습니다. 공개 전 항목도 분모에 포함하며, 같은 항목을 여러 번 열어도 1개로 셉니다. 자료는 다운로드 주소 발급, 라이브·다시보기는 링크 열기 기준이며 실제 시청 시간은 확인하지 않습니다.</p>
    {current?.error ? <AdminInlineError onRetry={() => setRetry(value => value + 1)}>{current.error}</AdminInlineError> : !current?.data ? <AdminLoadingState title="이용 기록을 불러오는 중입니다."/> : <>
      {!current.data.rows.length && <AdminEmptyState title="등록된 수강권이 없습니다."/>}
      {current.data.rows.map(row => { const usage = learningUsage(row.items); return <article className="alu-course" key={row.enrollmentId}>
        <h4>{row.courseTitle}{row.cohortName ? ` · ${row.cohortName}` : ''}</h4>
        {row.enrollmentStatus !== 'active' && <p>현재 활성 상태가 아닌 수강권의 보존된 기록입니다.</p>}
        <p className="alu-rate"><b>참고 이용률 {usage.percent === null ? '계산 전' : `${usage.percent}%`}</b><span>{usage.used} / {usage.total}개 이용</span></p>
        {!usage.total && <p>등록된 구성 항목이 없어 이용률을 계산할 수 없습니다.</p>}
        <div className="alu-types">{usage.byType.map(type => <div key={type.type}><b>{usageLabels[type.type]}</b><span>{type.used} / {type.total}개</span></div>)}</div>
        <details><summary>항목별 근거 {usage.total}개 확인</summary><Evidence items={row.items}/></details>
        {row.historicalItems.length > 0 && <details><summary>현재 구성에서 빠진 과거 기록 {row.historicalItems.length}개</summary><p>아래 기록은 보존되며, 위 참고 이용률에서는 제외했습니다. 환불 검토 시 구매 당시 구성과 함께 확인하세요.</p><Evidence items={row.historicalItems} historical/></details>}
        <p className="meta">기록 기능 반영 전의 자료·라이브·다시보기 이용은 확인할 수 없습니다. 기록 없음이 미이용을 보장하지 않습니다.</p>
      </article>; })}
      <AdminPagination page={current.data.page} pages={Math.ceil(current.data.total / current.data.pageSize)} total={current.data.total} pageSize={current.data.pageSize} onChange={setPage}/>
    </>}
  </section>;
}
