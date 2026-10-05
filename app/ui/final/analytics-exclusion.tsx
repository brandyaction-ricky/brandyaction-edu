'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminButton, AdminCheckbox, AdminInlineError } from '@/features/admin-ui';

type Snapshot = { excluded: boolean; forced: boolean };
async function fetchSnapshot(kind: string, id: string, signal?: AbortSignal): Promise<Snapshot | null> {
  const response = await fetch(`/api/admin/analytics-exclusions?${new URLSearchParams({ kind, id })}`, { cache: 'no-store', signal });
  if (response.status === 403) return null;
  const data = await response.json();
  if (!response.ok || typeof data.excluded !== 'boolean' || typeof data.forced !== 'boolean') throw Error(data.error || '집계 표시를 확인하지 못했습니다.');
  return data;
}
export function AnalyticsExclusion({ kind, id, onChanged }: { kind: 'member' | 'order'; id: string; onChanged?: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [hidden, setHidden] = useState(false);
  const [excluded, setExcluded] = useState(false), [reason, setReason] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function load() {
    const data = await fetchSnapshot(kind, id);
    setHidden(!data); setSnapshot(data); if (data) setExcluded(data.excluded); setError('');
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetchSnapshot(kind, id, controller.signal).then(data => {
      if (!controller.signal.aborted) { setHidden(!data); setSnapshot(data); if (data) setExcluded(data.excluded); setError(''); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [kind, id]);
  async function save() {
    if (busy.current || !snapshot) return;
    busy.current = true; setPending(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/analytics-exclusions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, id, excluded, expected: snapshot.excluded, reason }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '저장하지 못했습니다.');
      if (typeof data.excluded !== 'boolean') throw Error('저장 결과를 확인하지 못했습니다. 표시를 새로 확인해 주세요.');
      setSnapshot({ ...snapshot, excluded: data.excluded }); setReason('');
      setMessage('집계 표시를 저장했습니다.'); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  }
  if (hidden) return null;
  const label = kind === 'member' ? '내부 계정' : '시험 주문';
  return <section className="notice mt24" aria-label={`${label} 집계 설정`}>
    <h3>매출·유입 집계</h3>
    <p className="meta mt8">{label}으로 표시하면 통계에서 제외됩니다. 결제·환불 내역과 수강권은 그대로 유지됩니다.</p>
    {error && <AdminInlineError onRetry={() => void load().catch(cause => setError(cause.message))}>{error}</AdminInlineError>}
    {snapshot ? snapshot.forced ? <p className="mt16">관리자·스태프는 자동으로 제외됩니다.</p> : <>
      <AdminCheckbox className="mt16" label={`${label} · 집계에서 제외`} checked={excluded} disabled={pending} onChange={event => { setExcluded(event.target.checked); setMessage(''); }}/>
      {excluded !== snapshot.excluded && <><label className="mt16 block">표시 사유<textarea className="input mt8" value={reason} maxLength={500} rows={2} disabled={pending} placeholder="예: 내부 결제 검수용 주문" onChange={event => setReason(event.target.value)}/></label><AdminButton className="mt16" disabled={pending || reason.trim().length < 2} onClick={() => void save()}>{pending ? '저장 중…' : '집계 표시 저장'}</AdminButton></>}
    </> : <p className="meta mt16">표시를 확인하고 있습니다.</p>}
    {message && <p className="mt16" role="status">{message}</p>}
  </section>;
}
