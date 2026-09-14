'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Download, SlidersHorizontal, X } from 'lucide-react';
import { displayDimension, type DashboardReport } from '@/lib/landing-performance';
import { FILTER_LABELS, emptyFilters, type FilterKey, type TrackingFilters } from '@/lib/landing-admin-state';

let modalDepth = 0;
let savedBodyOverflow = '';

export function TrackingModal({ title, children, onClose, variant = 'drawer' }: { title: string; children: ReactNode; onClose: () => void; variant?: 'drawer' | 'filters' | 'confirm' }) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => {
    const dialog = ref.current!, previous = document.activeElement as HTMLElement | null;
    if (modalDepth === 0) savedBodyOverflow = document.body.style.overflow;
    modalDepth++;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); modalDepth--; if (modalDepth === 0) document.body.style.overflow = savedBodyOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`tracking-modal tracking-${variant}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header><h2 id={id}>{title}</h2><button type="button" className="btn icon" aria-label="패널 닫기" onClick={onClose}><X size={18}/></button></header>{children}
  </dialog>;
}
export function DiscardConfirmation({ message, onCancel, onDiscard }: { message: string; onCancel: () => void; onDiscard: () => void }) {
  return <TrackingModal title="저장하지 않은 변경사항" variant="confirm" onClose={onCancel}><div className="tracking-drawer-body"><p>{message}</p></div><footer><button type="button" className="btn" onClick={onCancel}>계속 편집</button><button type="button" className="btn primary" onClick={onDiscard}>변경사항 버리기</button></footer></TrackingModal>;
}
export function InlineError({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return <div className="tracking-error" role="alert"><span>{children}</span>{onRetry && <button type="button" className="btn" onClick={onRetry}>재시도</button>}</div>;
}
export function CompactEmpty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="tracking-empty"><strong>{title}</strong><p>{children}</p>{action}</div>;
}
export function TrackingSkeleton({ kind = 'dashboard' }: { kind?: string }) {
  return <div role="status" aria-label="데이터 불러오는 중" className="tracking-skeletons">{kind === 'dashboard' && <div className="tracking-kpis">{[0, 1, 2, 3].map(key => <div className="tracking-skeleton tracking-card" key={key}/>)}</div>}<div className="tracking-skeleton tracking-skeleton-chart"/><div className="tracking-skeleton tracking-skeleton-table"/></div>;
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
    <button type="button" className="btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{FILTER_LABELS[filterKey]}{selected.length > 0 && ` · ${selected.length}`}<ChevronDown size={14}/></button>
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
  const chips = <div className="tracking-chips" aria-label="적용된 필터">{keys.flatMap(key => filters[key].map(value => <button type="button" key={`${key}-${value}`} className="tracking-chip" onClick={() => toggle(key, value)} aria-label={`${FILTER_LABELS[key]} ${filterLabel(key, value)} 필터 삭제`}>{FILTER_LABELS[key]}: {filterLabel(key, value)}<X size={12}/></button>))}{count > 0 && <button type="button" className="btn" onClick={() => onChange(emptyFilters())}>전체 초기화</button>}</div>;
  const controls = <div className="tracking-filter-body"><div className="tracking-filter-grid">{keys.map(key => <MultiSelect key={key} filterKey={key} selected={filters[key]} values={[...new Set([...allOptions[key], ...filters[key]])]} onToggle={value => toggle(key, value)}/>)}</div>{mobile && chips}<p className="tracking-help">선택한 필터는 KPI·비교·차트·소재표·CSV에 동일하게 적용됩니다. 캠페인 누적 운영 요약은 필터와 무관합니다.</p></div>;
  return <section className="tracking-card tracking-filters"><div className="tracking-section-head"><button type="button" className="btn" onClick={() => setOpen(!open)} aria-expanded={open}><SlidersHorizontal size={16}/>상세 필터{count ? ` · ${count}개 적용 중` : ''}</button><button type="button" className="btn" disabled={disabled || exporting} onClick={download}><Download size={16}/>{exporting ? '내보내는 중' : 'CSV 내보내기'}</button></div>{count > 0 && chips}{open && (mobile ? <TrackingModal title="상세 필터" variant="filters" onClose={() => setOpen(false)}>{controls}<footer><button type="button" className="btn primary" onClick={() => setOpen(false)}>선택 완료</button></footer></TrackingModal> : controls)}{error && <InlineError onRetry={download}>{error}</InlineError>}</section>;
}
