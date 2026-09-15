'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Download, X } from 'lucide-react';
import { displayDimension, type DashboardReport } from '@/lib/landing-performance';
import { FILTER_LABELS, emptyFilters, type FilterKey, type TrackingFilters } from '@/lib/landing-admin-state';
import { AdminButton, AdminConfirmDialog, AdminDrawer, AdminEmptyState, AdminFilterTrigger, AdminInlineError, AdminModal, AdminSkeleton, AdminTableToolbar } from '@/app/ui/final/admin-system';

export function TrackingModal({ title, children, onClose, variant = 'drawer' }: { title: string; children: ReactNode; onClose: () => void; variant?: 'drawer' | 'filters' | 'confirm' }) {
  if (variant === 'confirm') return <AdminModal title={title} onClose={onClose} className="tracking-confirm">{children}</AdminModal>;
  return <AdminDrawer title={title} onClose={onClose} size={variant === 'filters' ? 'small' : 'default'} className={variant === 'filters' ? 'tracking-filter-drawer' : 'tracking-drawer'}>{children}</AdminDrawer>;
}
export function DiscardConfirmation({ message, onCancel, onDiscard }: { message: string; onCancel: () => void; onDiscard: () => void }) {
  return <AdminConfirmDialog title="저장하지 않은 변경사항" message={message} cancelLabel="계속 편집" confirmLabel="변경사항 버리기" onCancel={onCancel} onConfirm={onDiscard}/>;
}
export function InlineError({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return <AdminInlineError onRetry={onRetry}>{children}</AdminInlineError>;
}
export function CompactEmpty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <AdminEmptyState title={title} action={action} compact>{children}</AdminEmptyState>;
}
export function TrackingSkeleton() {
  return <div className="tracking-skeletons"><div className="tracking-skeleton-metrics">{Array.from({ length: 8 }, (_, key) => <AdminSkeleton lines={2} key={key}/>)}</div><AdminSkeleton lines={5}/><AdminSkeleton lines={4}/></div>;
}
export function filterLabel(key: FilterKey, value: string) {
  if (key === 'ad_type') return ({ cold: '콜드', retarget: '리타겟', unclassified: '미분류' } as Record<string, string>)[value] || '미분류';
  if (key === 'device') return ({ mobile: '모바일', desktop: '데스크톱', tablet: '태블릿', unknown: '미분류' } as Record<string, string>)[value] || displayDimension(value);
  return displayDimension(value);
}
function MultiSelect({ filterKey, values, selected, onToggle }: { filterKey: FilterKey; values: string[]; selected: string[]; onToggle: (value: string) => void }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  return <div className="tracking-multiselect" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus(); } }}>
    <AdminButton type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{FILTER_LABELS[filterKey]}{selected.length > 0 && ` · ${selected.length}`}<ChevronDown size={14}/></AdminButton>
    {open && <div id={id} className="tracking-options" role="group" aria-label={`${FILTER_LABELS[filterKey]} 다중 선택`}>{values.length ? values.map(value => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)}/><span>{filterLabel(filterKey, value)}</span></label>) : <p>수집된 항목이 없습니다.</p>}</div>}
  </div>;
}
export function TrackingFiltersPanel({ options, filters, onChange, exportUrl, disabled = false }: { options?: DashboardReport['options']; filters: TrackingFilters; onChange: (value: TrackingFilters) => void; exportUrl: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false), [mobile, setMobile] = useState(false), [exporting, setExporting] = useState(false), [error, setError] = useState('');
  const exportLock = useRef(false);
  useEffect(() => { const media = matchMedia('(max-width: 700px)'); const update = () => setMobile(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const count = Object.values(filters).reduce((sum, values) => sum + values.length, 0);
  const keys = Object.keys(FILTER_LABELS) as FilterKey[];
  const allOptions: Record<FilterKey, string[]> = { utm_campaign: options?.campaigns || [], ad_type: options?.ad_types || [], adset: options?.adsets || [], creative: options?.creatives || [], device: options?.devices || [], layout: options?.layouts.map(String) || [] };
  const toggle = (key: FilterKey, value: string) => onChange({ ...filters, [key]: filters[key].includes(value) ? filters[key].filter(item => item !== value) : [...filters[key], value] });
  async function download() {
    if (exportLock.current) return;
    exportLock.current = true; setExporting(true); setError('');
    try {
      const response = await fetch(exportUrl, { cache: 'no-store' });
      if (!response.ok) { const data = await response.json(); throw Error(data.error || 'CSV를 내려받지 못했습니다.'); }
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement('a');
      const disposition = response.headers.get('Content-Disposition') || '';
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      anchor.href = url; anchor.download = encoded ? decodeURIComponent(encoded) : disposition.match(/filename="([^"]+)"/)?.[1] || '무료클래스-성과.csv';
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError((error as Error).message); } finally { exportLock.current = false; setExporting(false); }
  }
  const chips = <div className="tracking-chips" aria-label="적용된 필터">{keys.flatMap(key => filters[key].map(value => <button type="button" key={`${key}-${value}`} className="tracking-chip" onClick={() => toggle(key, value)} aria-label={`${FILTER_LABELS[key]} ${filterLabel(key, value)} 필터 삭제`}>{FILTER_LABELS[key]}: {filterLabel(key, value)}<X size={12}/></button>))}{count > 0 && <AdminButton size="sm" onClick={() => onChange(emptyFilters())}>전체 초기화</AdminButton>}</div>;
  const controls = <div className="tracking-filter-body"><div className="tracking-filter-grid">{keys.map(key => <MultiSelect key={key} filterKey={key} selected={filters[key]} values={[...new Set([...allOptions[key], ...filters[key]])]} onToggle={value => toggle(key, value)}/>)}</div>{mobile && chips}<p className="tracking-help">선택한 필터는 KPI·비교·차트·소재표·CSV에 동일하게 적용됩니다. 캠페인 누적 운영 요약은 필터와 무관합니다.</p></div>;
  return <div className="tracking-filters"><AdminTableToolbar chips={count > 0 ? chips : undefined}><AdminFilterTrigger count={count} onClick={() => setOpen(!open)} aria-expanded={open}>상세 필터</AdminFilterTrigger><AdminButton tone="secondary" disabled={disabled || exporting} onClick={download}><Download size={16}/>{exporting ? '내보내는 중' : 'CSV 내보내기'}</AdminButton></AdminTableToolbar>{open && (mobile ? <TrackingModal title="상세 필터" variant="filters" onClose={() => setOpen(false)}>{controls}<footer className="admin-dialog-footer"><AdminButton tone="primary" onClick={() => setOpen(false)}>선택 완료</AdminButton></footer></TrackingModal> : controls)}{error && <InlineError onRetry={download}>{error}</InlineError>}</div>;
}
