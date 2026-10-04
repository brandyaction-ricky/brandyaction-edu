'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  LoaderCircle,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  forwardRef,
  cloneElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TableHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const classes = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');
export type AdminContentWidth = 'wide' | 'standard' | 'narrow';
export type AdminTemplate = 'data-list' | 'analytics' | 'editor' | 'review' | 'settings';

export function AdminPage({ width = 'standard', template, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { width?: AdminContentWidth; template?: AdminTemplate }) {
  return <div className={classes('admin-page', 'adm-stack', `admin-page--${width}`, template && `admin-template--${template}`, className)} {...props}>{children}</div>;
}
export function AdminPageHeader({ title, description, eyebrow, actions, className }: { title: string; description?: ReactNode; eyebrow?: string; actions?: ReactNode; className?: string }) {
  return <header className={classes('admin-page-header', 'adm-page-head', className)}><div>{eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="admin-page-description">{description}</p>}</div>{actions && <div className="admin-page-actions">{actions}</div>}</header>;
}
export function AdminContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={classes('admin-content-flow', 'adm-stack', className)} {...props}/>; }
export function AdminSection({ title, description, actions, bordered = false, className, children, ...props }: HTMLAttributes<HTMLElement> & { title?: ReactNode; description?: ReactNode; actions?: ReactNode; bordered?: boolean }) {
  return <section className={classes('admin-section', bordered ? 'admin-section--bordered adm-card' : 'adm-stack', className)} {...props}>{(title || description || actions) && <div className="admin-section-header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions && <div className="admin-section-actions">{actions}</div>}</div>}{children}</section>;
}
export function AdminDivider({ className, ...props }: HTMLAttributes<HTMLHRElement>) { return <hr className={classes('admin-divider', className)} {...props}/>; }
export function AdminStack({ gap = 'component', className, style, ...props }: HTMLAttributes<HTMLDivElement> & { gap?: 'control' | 'component' | 'section' }) { return <div className={classes('admin-stack', 'adm-stack', className)} style={{ '--admin-stack-gap': `var(--admin-${gap}-gap)`, ...style } as CSSProperties} {...props}/>; }
export function AdminGrid({ columns = 2, className, style, ...props }: HTMLAttributes<HTMLDivElement> & { columns?: number }) { return <div className={classes('admin-grid', className)} style={{ '--admin-grid-columns': columns, ...style } as CSSProperties} {...props}/>; }

// Public Phase 3 names reuse the existing layout implementation; no second shell is introduced.
export { AdminPage as AdminLayout, AdminPageHeader as PageHeader, AdminSection as PageSection, AdminContent as ContentContainer };

export type AdminButtonTone = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type AdminButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type AdminControlSize = 'sm' | 'md' | 'lg';
export const AdminButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AdminButtonVariant; tone?: AdminButtonTone; size?: AdminControlSize; loading?: boolean }>(function AdminButton({ variant, tone, size = 'md', loading = false, className, type = 'button', disabled, children, ...props }, ref) {
  // `tone` is a compatibility path. In particular, its old dark `secondary` must not silently change.
  const appearance = variant ? `admin-button--variant-${variant}` : `admin-button--${tone || 'tertiary'}`;
  return <button ref={ref} type={type} className={classes('admin-button', 'adm-btn', appearance, `admin-button--${size}`, variant === 'primary' && 'adm-btn--primary', variant === 'danger' && 'adm-btn--danger', size === 'sm' && 'adm-btn--sm', className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading && <LoaderCircle className="admin-button-spinner" size={16} aria-hidden="true"/>}{children}</button>;
});
export function AdminLinkButton({ variant = 'outline', size = 'md', className, ...props }: ComponentProps<typeof Link> & { variant?: AdminButtonVariant; size?: AdminControlSize }) {
  return <Link className={classes('admin-button', 'adm-btn', `admin-button--variant-${variant}`, variant === 'primary' && 'adm-btn--primary', variant === 'danger' && 'adm-btn--danger', size === 'sm' && 'adm-btn--sm', `admin-button--${size}`, className)} {...props} />;
}
export const AdminIconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: AdminButtonTone; variant?: AdminButtonVariant; size?: AdminControlSize; loading?: boolean }>(function AdminIconButton({ label, tone, variant, className, ...props }, ref) {
  return <AdminButton ref={ref} tone={tone} variant={variant} className={classes('admin-icon-button', className)} aria-label={label} title={label} {...props}/>;
});

type FieldProps = { label: ReactNode; labelHidden?: boolean; helper?: ReactNode; error?: string };
export function AdminFormField({ label, helper, error, className, children }: { label: ReactNode; helper?: ReactNode; error?: string; className?: string; children: ReactNode }) {
  return <label className={classes('admin-field', 'adm-field', className)}><span className="admin-field-label field-label">{label}</span>{children}{(error || helper) && <small className={classes('admin-field-help field-hint', error && 'admin-field-error')}>{error || helper}</small>}</label>;
}
function FieldShell({ label, labelHidden, helper, error, id, children, inline = false }: FieldProps & { id: string; children: ReactNode; inline?: boolean }) {
  const helpId = helper || error ? `${id}-help` : undefined;
  return <label className={classes('admin-field', 'adm-field', inline && 'admin-field--inline')} htmlFor={id}><span className={classes('admin-field-label', labelHidden && 'admin-visually-hidden')}>{label}</span>{children}{helpId && <small id={helpId} className={classes('admin-field-help', error && 'admin-field-error')}>{error || helper}</small>}</label>;
}
export const AdminInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldProps & { size?: AdminControlSize }>(function AdminInput({ label, labelHidden, helper, error, id: supplied, className, required, size = 'md', ...props }, ref) {
  const generated = useId(), id = supplied || generated, helpId = helper || error ? `${id}-help` : undefined;
  return <FieldShell label={<>{label}{required && <span aria-hidden="true"> *</span>}</>} labelHidden={labelHidden} helper={helper} error={error} id={id}><input ref={ref} id={id} required={required} aria-invalid={error ? 'true' : undefined} aria-errormessage={error ? helpId : undefined} aria-describedby={!error ? helpId : undefined} className={classes('admin-input', 'adm-input', `admin-control--${size}`, className)} {...props}/></FieldShell>;
});
export const AdminSelect = forwardRef<HTMLSelectElement, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & FieldProps & { size?: AdminControlSize }>(function AdminSelect({ label, labelHidden, helper, error, id: supplied, className, required, children, size = 'md', ...props }, ref) {
  const generated = useId(), id = supplied || generated, helpId = helper || error ? `${id}-help` : undefined;
  return <FieldShell label={<>{label}{required && <span aria-hidden="true"> *</span>}</>} labelHidden={labelHidden} helper={helper} error={error} id={id}><select ref={ref} id={id} required={required} aria-invalid={error ? 'true' : undefined} aria-errormessage={error ? helpId : undefined} aria-describedby={!error ? helpId : undefined} className={classes('admin-select', 'adm-select', `admin-control--${size}`, className)} {...props}>{children}</select></FieldShell>;
});
export const AdminTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function AdminTextarea({ label, labelHidden, helper, error, id: supplied, className, required, ...props }, ref) {
  const generated = useId(), id = supplied || generated, helpId = helper || error ? `${id}-help` : undefined;
  return <FieldShell label={<>{label}{required && <span aria-hidden="true"> *</span>}</>} labelHidden={labelHidden} helper={helper} error={error} id={id}><textarea ref={ref} id={id} required={required} aria-invalid={error ? 'true' : undefined} aria-errormessage={error ? helpId : undefined} aria-describedby={!error ? helpId : undefined} className={classes('admin-textarea', 'adm-textarea', className)} {...props}/></FieldShell>;
});
export const AdminCheckbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; helper?: ReactNode; error?: string }>(function AdminCheckbox({ label, helper, error, id: supplied, className, ...props }, ref) {
  const generated = useId(), id = supplied || generated;
  return <label className={classes('admin-checkbox', 'adm-check', className)} htmlFor={id}><input ref={ref} id={id} type="checkbox" aria-invalid={error ? 'true' : undefined} aria-describedby={error || helper ? `${id}-help` : undefined} {...props}/><span>{label}{(error || helper) && <small id={`${id}-help`} className={error ? 'admin-field-error' : undefined}>{error || helper}</small>}</span></label>;
});
export const AdminRadio = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; helper?: ReactNode; error?: string }>(function AdminRadio({ label, helper, error, id: supplied, className, ...props }, ref) {
  const generated = useId(), id = supplied || generated;
  return <label className={classes('admin-radio', 'adm-choice', className)} htmlFor={id}><input ref={ref} id={id} type="radio" aria-describedby={error || helper ? `${id}-help` : undefined} {...props}/><span>{label}{(error || helper) && <small id={`${id}-help`} className={error ? 'admin-field-error' : undefined}>{error || helper}</small>}</span></label>;
});
export const AdminSwitch = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; helper?: ReactNode; error?: string }>(function AdminSwitch({ label, helper, error, id: supplied, className, ...props }, ref) {
  const generated = useId(), id = supplied || generated;
  return <label className={classes('admin-switch', 'adm-choice', className)} htmlFor={id}><input ref={ref} id={id} type="checkbox" role="switch" aria-invalid={error ? 'true' : undefined} aria-describedby={error || helper ? `${id}-help` : undefined} {...props}/><span className="admin-switch-track" aria-hidden="true"/><span>{label}{(error || helper) && <small id={`${id}-help`} className={error ? 'admin-field-error' : undefined}>{error || helper}</small>}</span></label>;
});
export const AdminDatePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & FieldProps & { size?: AdminControlSize }>(function AdminDatePicker(props, ref) { return <AdminInput ref={ref} type="date" {...props}/>; });
export const AdminSearchField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & { label?: string; size?: AdminControlSize; error?: string }>(function AdminSearchField({ label = '검색', id: supplied, className, size = 'md', error, ...props }, ref) {
  const generated = useId(), id = supplied || generated;
  return <label className={classes('admin-search-field', 'adm-field', `admin-search-field--${size}`, className)} htmlFor={id}><span className="admin-visually-hidden">{label}</span><Search size={16} aria-hidden="true"/><input className="adm-input" ref={ref} id={id} type="search" aria-label={label} aria-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : undefined} {...props}/>{error && <small id={`${id}-error`} className="admin-field-error">{error}</small>}</label>;
});
export { AdminSearchField as AdminSearchInput };
export function AdminFilterTrigger({ count = 0, children = '필터', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { count?: number }) { return <AdminButton {...props}><SlidersHorizontal size={16}/>{children}{count > 0 && <span>· {count}개</span>}</AdminButton>; }

export function AdminMetricGrid({ columns = 4, className, ...props }: HTMLAttributes<HTMLDivElement> & { columns?: 2 | 4 | 8 }) { return <div className={classes('admin-metric-grid', `admin-metric-grid--${columns}`, className)} {...props}/>; }
export function AdminMetric({ label, value, note, change, className }: { label: ReactNode; value: ReactNode; note?: ReactNode; change?: ReactNode; className?: string }) { return <article className={classes('admin-metric', className)}><h2>{label}</h2><div className="admin-metric-value">{value}</div>{note && <p className="admin-metric-note">{note}</p>}{change && <div className="admin-metric-change">{change}</div>}</article>; }
export function AdminSummaryCard({ label, value, note, scope, compact = false, className }: { label: ReactNode; value: ReactNode; note?: ReactNode; scope?: ReactNode; compact?: boolean; className?: string }) {
  return <AdminMetric label={label} value={value} note={scope ? <>{note}{note && ' · '}{scope}</> : note} className={classes(compact && 'admin-metric--compact', className)}/>;
}
export type AdminTableSort = { columnId: string; direction: 'asc' | 'desc' };
export type AdminTableColumn<Row> = {
  id: string;
  header: ReactNode;
  value?: (row: Row) => string | number | null | undefined;
  render?: (row: Row) => ReactNode;
  status?: (row: Row) => { status: string; label?: string; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'danger' };
  sortable?: boolean;
  sortValue?: (row: Row) => string | number | null | undefined;
  align?: 'text' | 'number' | 'center' | 'action';
  width?: string;
};
export type AdminTableSelection = { selectedIds: readonly string[]; onChange: (ids: string[]) => void; bulkActions?: ReactNode };
export type AdminDataTableProps<Row> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  children?: ReactNode;
  tableClassName?: string;
  sticky?: boolean;
  density?: 'compact' | 'standard' | 'comfortable';
  rows?: readonly Row[];
  columns?: readonly AdminTableColumn<Row>[];
  getRowId?: (row: Row) => string;
  rowLabel?: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  sort?: AdminTableSort | null;
  onSortChange?: (sort: AdminTableSort) => void;
  selection?: AdminTableSelection;
  pagination?: ComponentProps<typeof AdminPagination>;
  loading?: boolean;
  empty?: ReactNode;
  error?: ReactNode;
};
export function AdminDataTable<Row>({ label, children, className, tableClassName, sticky = true, density = 'compact', rows, columns, getRowId, rowLabel, onRowClick, sort, onSortChange, selection, pagination, loading = false, empty, error, ...props }: AdminDataTableProps<Row>) {
  const hintId = useId();
  const [localSort, setLocalSort] = useState<AdminTableSort | null>(null);
  const activeSort = sort === undefined ? localSort : sort;
  const dataMode = rows !== undefined && columns !== undefined && getRowId !== undefined;
  const ordered = useMemo(() => {
    if (!dataMode || !activeSort || onSortChange) return rows || [];
    const column = columns.find(item => item.id === activeSort.columnId);
    const getValue = column?.sortValue || column?.value;
    if (!getValue) return rows;
    return rows.map((row, index) => ({ row, index })).sort((a, b) => {
      const left = getValue(a.row), right = getValue(b.row);
      if (left == null) return right == null ? a.index - b.index : 1;
      if (right == null) return -1;
      const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'ko', { numeric: true });
      return (activeSort.direction === 'asc' ? order : -order) || a.index - b.index;
    }).map(item => item.row);
  }, [activeSort, columns, dataMode, onSortChange, rows]);
  const rowIds = dataMode ? ordered.map(getRowId) : [];
  const selected = selection?.selectedIds || [];
  const allSelected = rowIds.length > 0 && rowIds.every(id => selected.includes(id));
  const changeSort = (columnId: string) => {
    const next: AdminTableSort = { columnId, direction: activeSort?.columnId === columnId && activeSort.direction === 'asc' ? 'desc' : 'asc' };
    if (sort === undefined) setLocalSort(next);
    onSortChange?.(next);
  };
  const toggleAll = () => {
    if (!selection) return;
    const remaining = selected.filter(id => !rowIds.includes(id));
    selection.onChange(allSelected ? remaining : [...remaining, ...rowIds]);
  };
  const tableContent = dataMode ? <>
    <thead><tr>{selection && <th scope="col" className="admin-table-select-cell"><input type="checkbox" aria-label="현재 페이지 모두 선택" checked={allSelected} ref={node => { if (node) node.indeterminate = !allSelected && rowIds.some(id => selected.includes(id)); }} onChange={toggleAll} disabled={loading || rowIds.length === 0}/></th>}{columns.map(column => <th key={column.id} scope="col" data-align={column.align || 'text'} style={column.width ? { width: column.width } : undefined} aria-sort={activeSort?.columnId === column.id ? activeSort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>{column.sortable ? <button type="button" onClick={() => changeSort(column.id)}>{column.header}<span aria-hidden="true">{activeSort?.columnId === column.id ? activeSort.direction === 'asc' ? ' ↑' : ' ↓' : ' ↕'}</span></button> : column.header}</th>)}</tr></thead>
    <tbody>{ordered.length === 0 ? <tr><td colSpan={columns.length + (selection ? 1 : 0)}>{loading ? <AdminSkeleton lines={3} label={`${label} 불러오는 중`}/> : error ? <AdminErrorState>{error}</AdminErrorState> : empty || <AdminEmptyState compact title="조회 결과가 없습니다.">필터를 변경하거나 데이터를 등록해 주세요.</AdminEmptyState>}</td></tr> : ordered.map(row => {
      const id = getRowId(row);
      return <tr key={id} className={classes(onRowClick && 'admin-table-row--clickable', selected.includes(id) && 'admin-table-row--selected')} tabIndex={onRowClick ? 0 : undefined} aria-selected={selection ? selected.includes(id) : undefined} onClick={event => { if (!(event.target as HTMLElement).closest('button,a,input,select,textarea,[role="button"]')) onRowClick?.(row); }} onKeyDown={event => { if (event.target !== event.currentTarget || !onRowClick || !['Enter', ' '].includes(event.key)) return; event.preventDefault(); onRowClick(row); }}>
        {selection && <td className="admin-table-select-cell"><input type="checkbox" aria-label={`${rowLabel?.(row) || id} 선택`} checked={selected.includes(id)} onChange={() => selection.onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id])} onClick={event => event.stopPropagation()}/></td>}
        {columns.map(column => <td key={column.id} data-align={column.align || 'text'}>{column.render ? column.render(row) : column.status ? <AdminStatusBadge {...column.status(row)}/> : column.value?.(row) ?? '—'}</td>)}
      </tr>;
    })}</tbody>
  </> : children;
  return <div className={classes('admin-table-frame', `admin-table-density--${density}`, className)}><p className="admin-table-hint" id={hintId}>표는 좌우로 스크롤할 수 있습니다.</p>{selection && selected.length > 0 && <div className="admin-table-bulk" role="status"><span>{selected.length}개 선택</span>{selection.bulkActions}</div>}{error && (!dataMode || ordered.length > 0) && <AdminInlineError>{error}</AdminInlineError>}<div className={classes('admin-table-scroll', 'adm-table-wrap', sticky && 'admin-table--sticky')} role="region" aria-label={label} aria-describedby={hintId} aria-busy={loading || undefined} tabIndex={0} {...props}><table className={classes('admin-data-table', 'adm-table', tableClassName)}><caption className="admin-visually-hidden">{label}</caption>{tableContent}</table></div>{loading && ordered.length > 0 && <p className="admin-table-loading" role="status">{label} 새로 불러오는 중입니다.</p>}{pagination && <AdminPagination {...pagination}/>}</div>;
}
export function AdminTableToolbar({ result, chips, className, children }: { result?: ReactNode; chips?: ReactNode; className?: string; children: ReactNode }) { return <div className={classes('admin-table-toolbar-wrap', className)}><div className="admin-table-toolbar">{children}{result && <span className="admin-toolbar-result">{result}</span>}</div>{chips && <div className="admin-toolbar-chips">{chips}</div>}</div>; }
export function AdminQuickFilter({ items, value, onChange, label = '빠른 필터', disabled = false }: { items: readonly { value: string; label: string; count?: number }[]; value: string; onChange: (value: string) => void; label?: string; disabled?: boolean }) { return <div className="admin-quick-filter" role="group" aria-label={label}>{items.map(item => <button type="button" key={item.value} className="admin-quick-filter-item" aria-pressed={item.value === value} disabled={disabled} onClick={() => onChange(item.value)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}</div>; }
export function AdminFilterBar({ filters, status, date, search, action, onReset, onApply, appliedSummary, className }: { filters?: ReactNode; status?: ReactNode; date?: ReactNode; search?: ReactNode; action?: ReactNode; onReset?: () => void; onApply?: () => void; appliedSummary?: ReactNode; className?: string }) {
  return <div className={classes('admin-filter-bar', className, 'adm-filterbar')}><div className="admin-filter-bar-controls">{filters && <div className="admin-filter-bar-filters">{filters}</div>}{status && <div className="admin-filter-bar-status">{status}</div>}{date && <div className="admin-filter-bar-date">{date}</div>}{search && <div className="admin-filter-bar-search">{search}</div>}{onReset && <AdminButton variant="ghost" onClick={onReset}>초기화</AdminButton>}{onApply && <AdminButton variant="outline" onClick={onApply}>적용</AdminButton>}{action && <div className="admin-filter-bar-action">{action}</div>}</div>{appliedSummary && <div className="admin-filter-bar-summary">{appliedSummary}</div>}</div>;
}
export function AdminPagination({ page, pages, onChange, disabled = false, total, pageSize, onPageSizeChange }: { page: number; pages: number; onChange: (page: number) => void; disabled?: boolean; total?: number; pageSize?: number; onPageSizeChange?: (size: number) => void }) {
  const totalPages = Math.max(1, pages), atStart = page <= 1, atEnd = page >= totalPages;
  const first = total === 0 ? 0 : pageSize ? (page - 1) * pageSize + 1 : undefined;
  const last = total !== undefined && pageSize ? Math.min(page * pageSize, total) : undefined;
  return <nav className="admin-pagination adm-pagination" aria-label="페이지 이동">{total !== undefined && <span className="admin-pagination-total-range">{first !== undefined && last !== undefined ? `${first}–${last} / ` : ''}{total}건</span>}<div className="admin-pagination-actions"><AdminIconButton className="admin-pagination-edge" size="sm" label="첫 페이지" disabled={disabled || atStart} onClick={() => onChange(1)}><ChevronsLeft size={15} aria-hidden="true"/></AdminIconButton><AdminButton size="sm" disabled={disabled || atStart} onClick={() => onChange(page - 1)}><ChevronLeft size={15} aria-hidden="true"/>이전</AdminButton></div><span className="admin-pagination-status" aria-live="polite"><b>{page}</b><span aria-hidden="true"> / </span><span className="admin-visually-hidden">페이지, 총 </span>{totalPages}<span className="admin-visually-hidden">페이지</span></span><div className="admin-pagination-actions"><AdminButton size="sm" disabled={disabled || atEnd} onClick={() => onChange(page + 1)}>다음<ChevronRight size={15} aria-hidden="true"/></AdminButton><AdminIconButton className="admin-pagination-edge" size="sm" label="마지막 페이지" disabled={disabled || atEnd} onClick={() => onChange(totalPages)}><ChevronsRight size={15} aria-hidden="true"/></AdminIconButton></div>{onPageSizeChange && <label className="admin-pagination-size">페이지당 <select aria-label="페이지당 표시 개수" value={pageSize || 20} onChange={event => onPageSizeChange(Number(event.target.value))}>{[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>}</nav>;
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: '임시저장', tone: 'neutral' }, published: { label: '공개', tone: 'success' }, hidden: { label: '숨김', tone: 'neutral' }, archived: { label: '보관', tone: 'neutral' }, active: { label: '사용 중', tone: 'success' }, inactive: { label: '비활성', tone: 'neutral' }, suspended: { label: '사용 중지', tone: 'warning' }, paused: { label: '일시 중지', tone: 'warning' }, scheduled: { label: '시작 전', tone: 'info' }, recruiting: { label: '모집 중', tone: 'success' }, in_progress: { label: '운영 중', tone: 'info' }, completed: { label: '종료', tone: 'neutral' }, open: { label: '답변 대기', tone: 'warning' }, answered: { label: '답변 완료', tone: 'success' }, pending: { label: '대기', tone: 'warning' }, submitted: { label: '검토 대기', tone: 'warning' }, approved: { label: '승인 완료', tone: 'success' }, returned: { label: '보완 요청', tone: 'warning' }, changes_requested: { label: '보완 요청', tone: 'warning' }, rejected: { label: '반려', tone: 'danger' }, paid: { label: '결제 완료', tone: 'success' }, payment_failed: { label: '결제 실패', tone: 'danger' }, partially_refunded: { label: '부분 환불', tone: 'warning' }, refunded: { label: '환불 완료', tone: 'neutral' }, cancelled: { label: '취소', tone: 'neutral' }, not_configured: { label: '설정 필요', tone: 'warning' }, idle: { label: '동기화 대기', tone: 'neutral' }, syncing: { label: '동기화 중', tone: 'info' }, success: { label: '처리 완료', tone: 'success' }, failed: { label: '처리 실패', tone: 'danger' },
};
export function adminStatus(status: string, fallback = '상태 확인 필요') { return STATUS[status] || { label: fallback, tone: 'neutral' as const }; }
export function AdminStatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'danger'; className?: string }) { const value = adminStatus(status), text = label || value.label; return <span className={classes('admin-status-badge', 'adm-badge', `admin-status-badge--${tone || value.tone}`, className)} aria-label={`상태: ${text}`}>{text}</span>; }
export function AdminEmptyState({ title, children, action, compact = false }: { title: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean }) { return <div className={classes('admin-empty-state', 'adm-empty', compact && 'admin-empty-state--compact')}><Inbox size={compact ? 20 : 24} aria-hidden="true"/><div><strong>{title}</strong>{children && <p>{children}</p>}{action && <div className="admin-state-action">{action}</div>}</div></div>; }
export function AdminSuccessState({ title, children, action, compact = false }: { title: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean }) { return <div className={classes('admin-success-state', compact && 'admin-success-state--compact')} role="status"><CheckCircle2 size={compact ? 20 : 24} aria-hidden="true"/><div><strong>{title}</strong>{children && <p>{children}</p>}{action && <div className="admin-state-action">{action}</div>}</div></div>; }
export function AdminSkeleton({ lines = 3, className, label = '화면 정보를 불러오는 중입니다.' }: { lines?: number; className?: string; label?: string }) { return <div className={classes('admin-skeleton', className)} role="status" aria-live="polite" aria-busy="true"><span className="admin-visually-hidden">{label}</span>{Array.from({ length: lines }, (_, index) => <span aria-hidden="true" key={index}/>)}</div>; }
export function AdminLoadingState({ title = '화면 정보를 불러오는 중입니다.', description = '잠시만 기다려 주세요.' }: { title?: ReactNode; description?: ReactNode }) { return <div className="admin-loading-state" role="status" aria-live="polite" aria-busy="true"><div><strong>{title}</strong>{description && <p>{description}</p>}</div><AdminSkeleton lines={4} label={typeof title === 'string' ? title : undefined}/></div>; }
export function AdminInlineError({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) { return <div className="admin-inline-error" role="alert"><AlertCircle size={18} aria-hidden="true"/><span>{children}</span>{onRetry && <AdminButton size="sm" onClick={onRetry}>다시 시도</AdminButton>}</div>; }
export function AdminErrorState({ title = '정보를 불러오지 못했습니다.', children, onRetry }: { title?: ReactNode; children?: ReactNode; onRetry?: () => void }) { return <div className="admin-error-state" role="alert"><AlertCircle size={22} aria-hidden="true"/><div><strong>{title}</strong>{children && <p>{children}</p>}{onRetry && <AdminButton variant="outline" size="sm" onClick={onRetry}>다시 시도</AdminButton>}</div></div>; }
export { AdminSkeleton as AdminLoadingSkeleton };
export function AdminAlert({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: ReactNode; children: ReactNode }) { return <div className={classes('admin-alert', 'adm-notice', `admin-alert--${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>{title && <strong>{title}</strong>}<span>{children}</span></div>; }

const dialogStack: Array<{ node: HTMLDialogElement; restoreFocus: HTMLElement | null }> = [];
let savedOverflow = '';
function dialogTabStops(node: HTMLDialogElement) {
  return Array.from(node.querySelectorAll<HTMLElement>('a[href],area[href],button,input,select,textarea,summary,iframe,object,embed,[contenteditable],[tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden],[inert]') && element.closest('dialog') === node && element.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(element).visibility))
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
}
export function useAdminDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!, entry = { node, restoreFocus: document.activeElement as HTMLElement | null };
    if (dialogStack.length === 0) savedOverflow = document.body.style.overflow;
    dialogStack.push(entry); node.showModal(); document.body.style.overflow = 'hidden';
    node.querySelector<HTMLElement>('[data-admin-dialog-title]')?.focus();
    function trapTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || event.defaultPrevented || dialogStack.at(-1) !== entry) return;
      const stops = dialogTabStops(node), first = stops[0], last = stops.at(-1), active = document.activeElement;
      if (!first || !stops.includes(active as HTMLElement) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault(); event.stopPropagation();
        (event.shiftKey ? last : first)?.focus();
        if (!first) node.focus();
      }
    }
    document.addEventListener('keydown', trapTab, true);
    return () => {
      document.removeEventListener('keydown', trapTab, true);
      dialogStack.splice(dialogStack.indexOf(entry), 1);
      for (const remaining of dialogStack) if (remaining.restoreFocus && node.contains(remaining.restoreFocus)) remaining.restoreFocus = entry.restoreFocus;
      node.close();
      const top = dialogStack.at(-1);
      if (!top) document.body.style.overflow = savedOverflow;
      if (entry.restoreFocus?.isConnected && (!top || top.node.contains(entry.restoreFocus))) entry.restoreFocus.focus();
    };
  }, []);
  return dialog;
}
function AdminDialogSurface({ title, onClose, className, children }: { title: string; onClose: () => void; className: string; children: ReactNode }) {
  const dialog = useAdminDialog(), titleId = useId(), closeHandler = useRef(onClose);
  useEffect(() => { closeHandler.current = onClose; }, [onClose]);
  return <dialog ref={dialog} className={classes('admin-dialog', 'adm-modal', className)} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); event.stopPropagation(); closeHandler.current(); }} onClick={event => { if (event.target !== event.currentTarget) return; const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeHandler.current(); }}><header className="admin-dialog-header adm-modal-head"><h2 id={titleId} data-admin-dialog-title tabIndex={-1}>{title}</h2><AdminIconButton label="닫기" onClick={() => closeHandler.current()}><X size={18}/></AdminIconButton></header>{children}</dialog>;
}
export function AdminDrawer({ title, onClose, size = 'default', children, className }: { title: string; onClose: () => void; size?: 'small' | 'default' | 'large'; children: ReactNode; className?: string }) { return <AdminDialogSurface title={title} onClose={onClose} className={classes('admin-drawer', `admin-drawer--${size}`, className)}>{children}</AdminDialogSurface>; }
export function AdminModal({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) { return <AdminDialogSurface title={title} onClose={onClose} className={classes('admin-modal', className)}>{children}</AdminDialogSurface>; }
export function AdminConfirmDialog({ title = '변경사항 확인', message, confirmLabel = '확인', cancelLabel = '취소', destructive = false, onConfirm, onCancel }: { title?: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) { return <AdminModal title={title} onClose={onCancel}><div className="admin-dialog-body"><p>{message}</p></div><footer className="admin-dialog-footer"><AdminButton onClick={onCancel}>{cancelLabel}</AdminButton><AdminButton tone={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</AdminButton></footer></AdminModal>; }
export function AdminPopover({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) { return <details className={classes('admin-popover', className)}><summary>{label}</summary><div className="admin-popover-panel">{children}</div></details>; }
export function AdminTooltip({ content, children }: { content: ReactNode; children: ReactElement<{ 'aria-describedby'?: string }> }) { const id = useId(); const describedBy = [children.props['aria-describedby'], id].filter(Boolean).join(' '); return <span className="admin-tooltip"><span className="admin-tooltip-target">{cloneElement(children, { 'aria-describedby': describedBy })}</span><span id={id} className="admin-tooltip-content" role="tooltip">{content}</span></span>; }
export function AdminToast({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'error' | 'danger' }) { return <div className={classes('admin-toast', `admin-toast--${tone}`)} role={tone === 'danger' || tone === 'error' ? 'alert' : 'status'}>{children}</div>; }
export function AdminDialogBody(props: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={classes('admin-dialog-body', 'adm-modal-body', props.className)}/>; }
export function AdminDialogFooter(props: HTMLAttributes<HTMLElement>) { return <footer {...props} className={classes('admin-dialog-footer', 'adm-modal-foot', props.className)}/>; }
export type AdminTableProps = TableHTMLAttributes<HTMLTableElement>;
