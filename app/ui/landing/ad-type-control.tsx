'use client';

import { useRef, useState } from 'react';
import { displayDimension, type PerformanceRow } from '@/lib/landing-performance';
import { AdminButton } from '@/app/ui/final/admin-system';

const labels = { cold: '콜드', retarget: '리타겟', unclassified: '미분류' };
export type Classify = (row: PerformanceRow, value: PerformanceRow['ad_type']) => Promise<boolean>;

// Parent keys this control by the persisted value, so a successful server refresh
// establishes a new baseline. A rejected request keeps the selected draft to retry.
export function AdTypeControl({ row, disabled, onSave }: { row: PerformanceRow; disabled: boolean; onSave: Classify }) {
  const [selected, setSelected] = useState(row.ad_type);
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const lock = useRef(false);
  async function save(value: PerformanceRow['ad_type']) {
    if (lock.current || disabled) return;
    lock.current = true; setSelected(value); setStatus('saving');
    try { setStatus(await onSave(row, value) ? 'idle' : 'failed'); }
    catch { setStatus('failed'); }
    finally { lock.current = false; }
  }
  return <div className="tracking-ad-type">
    <select className="admin-select tracking-inline-select" aria-label={`${displayDimension(row.adset)} ${displayDimension(row.creative)} 광고 유형`} value={selected} disabled={disabled || status === 'saving'} onChange={event => void save(event.target.value as PerformanceRow['ad_type'])}>
      {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <small role={status === 'failed' ? 'alert' : 'status'}>{status === 'saving' ? '저장 중' : status === 'failed' ? `저장 실패 · 저장값: ${labels[row.ad_type]}` : `저장됨 · ${labels[row.ad_type]}`}</small>
    {status === 'failed' && <AdminButton size="sm" disabled={disabled} onClick={() => void save(selected)}>다시 저장</AdminButton>}
  </div>;
}
