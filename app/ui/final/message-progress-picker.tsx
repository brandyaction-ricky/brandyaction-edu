"use client";
import { useEffect, useState } from 'react';
import type { MessageProgressFilter } from '@/lib/message-progress-filter';

type Cohort = { id: string; name: string | null; courseTitle: string };
export function MessageProgressPicker({ value, onChange }: { value: MessageProgressFilter | null; onChange: (value: MessageProgressFilter | null) => void }) {
  const [cohorts, setCohorts] = useState<Cohort[]>(), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/member/messages?action=progress-cohorts', { cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.rows)) throw new Error(data.error || '기수 목록을 불러오지 못했습니다.');
      if (!abort.signal.aborted) { setCohorts(data.rows); setError(''); }
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [retry]);
  return <div className="edu-message-progress">
    <p>기수와 현재 진행 일차로 받는 사람을 좁힐 수 있습니다. 조건을 바꾸면 선택한 회원은 초기화됩니다.</p>
    {error && <p role="alert">{error} <button className="btn small" type="button" onClick={() => setRetry(n => n + 1)}>기수 목록 다시 확인</button></p>}
    <div className="row">
      <label>진도별 대상 기수<select value={value?.cohortId || ''} disabled={!cohorts} onChange={e => onChange(e.target.value ? { cohortId: e.target.value, track: value?.track || 'daily', day: value?.day || 1 } : null)}>
        <option value="">{cohorts ? '진도 조건 없이 선택' : '기수 목록 불러오는 중'}</option>
        {cohorts?.map(row => <option key={row.id} value={row.id}>{row.courseTitle} · {row.name || '기수명 없음'}</option>)}
      </select></label>
      <label>진도 과정<select value={value?.track || 'daily'} disabled={!value} onChange={e => value && onChange({ ...value, track: e.target.value as MessageProgressFilter['track'] })}>
        <option value="daily">데일리 미션</option><option value="learning">학습 &amp; 시험</option>
      </select></label>
      <label>현재 진행 일차<select value={value?.day || 1} disabled={!value} onChange={e => value && onChange({ ...value, day: Number(e.target.value) })}>
        {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}일차</option>)}
      </select></label>
    </div>
    {value && <p>현재 {value.day}일차를 진행하거나 해당 일차의 공개를 기다리는 수강생입니다. 과정을 모두 완료했거나 수강 기간이 끝난 회원은 제외됩니다.</p>}
  </div>;
}
