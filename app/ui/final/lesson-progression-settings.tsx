"use client";
import { useEffect, useRef, useState } from 'react';
import { useUnsavedWarning } from '@/features/admin-ui';
import type { Row } from '@/lib/platform';
type Settings = { cohortId: string; autoApproveThroughWeek: number | null; writeId: string | null };
async function request<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', cache: 'no-store', signal, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '학습 진행 설정을 불러오지 못했습니다.'), { status: response.status });
  return data;
}
function SettingsForm({ initial, onDirty, onBusy, reload }: { initial: Settings; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; reload: () => void }) {
  const [saved, setSaved] = useState(initial), [week, setWeek] = useState(initial.autoApproveThroughWeek);
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [conflict, setConflict] = useState(false), [uncertain, setUncertain] = useState(false);
  const retry = useRef<{ cohortId: string; expectedWriteId: string | null; requestId: string; autoApproveThroughWeek: number | null } | null>(null);
  useEffect(() => { onBusy(pending || uncertain); return () => onBusy(false); }, [pending, uncertain, onBusy]);
  useUnsavedWarning(pending || uncertain || saved.autoApproveThroughWeek !== week);
  async function save() {
    if (pending || conflict) return;
    retry.current ??= { cohortId: initial.cohortId, expectedWriteId: saved.writeId, requestId: crypto.randomUUID(), autoApproveThroughWeek: week };
    setPending(true); setMessage('');
    try {
      const result = await request<Settings>('/api/admin/lesson-progression', retry.current);
      if (result.writeId !== retry.current.requestId || result.cohortId !== initial.cohortId || result.autoApproveThroughWeek !== retry.current.autoApproveThroughWeek) throw new Error('저장 결과를 확인하지 못했습니다.');
      setSaved(result); setUncertain(false); retry.current = null; onDirty(false); setMessage('이 기수의 학습 진행 설정을 저장했습니다.');
    } catch (error) {
      const e = error as { status?: number; message?: string };
      setUncertain(!e.status || e.status >= 500); setConflict(e.status === 409); setMessage(e.message || '설정을 저장하지 못했습니다.');
      if (e.status && e.status < 500) retry.current = null;
    } finally { setPending(false); }
  }
  return <div><label>데일리 미션 자동승인 범위 <select value={week ?? ''} disabled={pending || uncertain || conflict} onChange={event => { const value = event.target.value ? Number(event.target.value) : null; setWeek(value); onDirty(value !== saved.autoApproveThroughWeek); }}>
    <option value="">자동승인 없음 — 멘토 승인 후 진행</option>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}주차까지 ({value * 5}일차까지)</option>)}
  </select></label>
    <p className="meta">선택한 주차까지 제출 즉시 승인됩니다. 마지막 일차를 완료해도 다음 주차는 열리지 않습니다. 다음 주차를 열려면 이 설정을 변경해 주세요. 별도 학습의 시험 통과 규칙에는 영향을 주지 않습니다.</p>
    <p className="meta">학습 콘텐츠 편집에서 ‘데일리 미션’ 또는 ‘별도 학습’과 전체 일차 번호를 지정한 수업에 적용됩니다.</p>
    <button className="btn primary" disabled={pending || conflict} onClick={() => void save()}>{pending ? '저장 중…' : uncertain ? '같은 설정 저장 다시 확인' : '자동승인 설정 저장'}</button>
    {message && <p role={conflict || uncertain ? 'alert' : 'status'} className="notice mt16">{message}</p>}
    {conflict && <button className="btn small" onClick={() => { if (window.confirm('현재 선택을 지우고 저장된 설정을 불러올까요?')) { onDirty(false); reload(); } }}>저장된 설정 다시 불러오기</button>}
  </div>;
}
export function LessonProgressionSettings({ cohorts }: { cohorts: Row[] }) {
  const [cohort, setCohort] = useState(''), [refresh, setRefresh] = useState(0), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; data?: Settings; error?: string } | null>(null);
  const key = `${cohort}:${refresh}`;
  useEffect(() => {
    if (!cohort) return;
    const abort = new AbortController();
    void request<Settings>('/api/admin/lesson-progression?' + new URLSearchParams({ cohort }), undefined, abort.signal)
      .then(data => { if (!abort.signal.aborted) setLoaded({ key, data }); }).catch(error => { if (!abort.signal.aborted) setLoaded({ key, error: error.message }); });
    return () => abort.abort();
  }, [cohort, key]);
  return <section className="panel pad mt24" aria-label="학습 개방과 자동승인"><h2>학습 개방·자동승인</h2>
    <label>설정할 기수 <select value={cohort} disabled={busy} onChange={event => { if (dirty && !window.confirm('저장하지 않은 설정을 지우고 다른 기수를 선택할까요?')) return; setDirty(false); setCohort(event.target.value); }}><option value="">기수를 선택해 주세요</option>{cohorts.map(row => <option key={row.id} value={String(row.id)}>{String(row.name || row.id)}</option>)}</select></label>
    {cohort && (loaded?.key !== key ? <p role="status">기수 설정을 불러오고 있습니다.</p> : loaded.error ? <div role="alert"><p>{loaded.error}</p><button className="btn" onClick={() => setRefresh(value => value + 1)}>설정 조회 다시 시도</button></div> : loaded.data && <SettingsForm key={key} initial={loaded.data} onDirty={setDirty} onBusy={setBusy} reload={() => setRefresh(value => value + 1)} />)}
  </section>;
}
