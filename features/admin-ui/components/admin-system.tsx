'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TableHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const classes = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');
export type AdminContentWidth = 'wide' | 'standard' | 'narrow';
export type AdminTemplate = 'data-list' | 'analytics' | 'editor' | 'review' | 'settings';

export function AdminPage({ width = 'standard', template, className, children, ...props }: HTMLAttributes<HTMLDivElement> & { width?: AdminContentWidth; template?: AdminTemplate }) {
  return <div className={classes('admin-page', `admin-page--${width}`, template && `admin-template--${template}`, className)} {...props}>{children}</div>;
}
export function AdminPageHeader({ title, description, eyebrow, actions, className }: { title: string; description?: ReactNode; eyebrow?: string; actions?: ReactNode; className?: string }) {
  return <header className={classes('admin-page-header', className)}><div>{eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="admin-page-description">{description}</p>}</div>{actions && <div className="admin-page-actions">{actions}</div>}</header>;
}
export function AdminContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={classes('admin-content-flow', className)} {...props}/>; }
export function AdminSection({ title, description, actions, bordered = false, className, children, ...props }: HTMLAttributes<HTMLElement> & { title?: ReactNode; description?: ReactNode; actions?: ReactNode; bordered?: boolean }) {
  return <section className={classes('admin-section', bordered && 'admin-section--bordered', className)} {...props}>{(title || description || actions) && <div className="admin-section-header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions && <div className="admin-section-actions">{actions}</div>}</div>}{children}</section>;
}
export function AdminDivider({ className, ...props }: HTMLAttributes<HTMLHRElement>) { return <hr className={classes('admin-divider', className)} {...props}/>; }
export function AdminStack({ gap = 'component', className, style, ...props }: HTMLAttributes<HTMLDivElement> & { gap?: 'control' | 'component' | 'section' }) { return <div className={classes('admin-stack', className)} style={{ '--admin-stack-gap': `var(--admin-${gap}-gap)`, ...style } as CSSProperties} {...props}/>; }
export function AdminGrid({ columns = 2, className, style, ...props }: HTMLAttributes<HTMLDivElement> & { columns?: number }) { return <div className={classes('admin-grid', className)} style={{ '--admin-grid-columns': columns, ...style } as CSSProperties} {...props}/>; }

export type AdminButtonTone = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export const AdminButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: AdminButtonTone; size?: 'sm' | 'md' }>(function AdminButton({ tone = 'tertiary', size = 'md', className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={classes('admin-button', `admin-button--${tone}`, `admin-button--${size}`, className)} {...props}/>;
});
export const AdminIconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: AdminButtonTone; size?: 'sm' | 'md' }>(function AdminIconButton({ label, tone, className, ...props }, ref) {
  return <AdminButton ref={ref} tone={tone} className={classes('admin-icon-button', className)} aria-label={label} title={label} {...props}/>;
});

type FieldProps = { label: ReactNode; helper?: ReactNode; error?: string };
function FieldShell({ label, helper, error, id, children, inline = false }: FieldProps & { id: string; children: ReactNode; inline?: boolean }) {
  const helpId = helper || error ? `${id}-help` : undefined;
  return <label className={classes('admin-field', inline && 'admin-field--inline')} htmlFor={id}><span className="admin-field-label">{label}</span>{children}{helpId && <small id={helpId} className={classes('admin-field-help', error && 'admin-field-error')}>{error || helper}</small>}</label>;
}
export const AdminInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function AdminInput({ label, helper, error, id: supplied, className, required, ...props }, ref) {
  const generated = useId(), id = supplied || generated, helpId = helper || error ? `${id}-help` : undefined;
  return <FieldShell label={<>{label}{required && <span aria-hidden="true"> *</span>}</>} helper={helper} error={error} id={id}><input ref={ref} id={id} required={required} aria-invalid={error ? 'true' : undefined} aria-errormessage={error ? helpId : undefined} aria-describedby={!error ? helpId : undefined} className={classes('admin-input', className)} {...props}/></FieldShell>;
});
export const AdminSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function AdminSelect({ label, helper, error, id: supplied, className, required, children, ...props }, ref) {
  const generated = useId(), id = supplied || generated, helpId = helper || error ? `${id}-help` : undefined;
  return <FieldShell label={<>{label}{required && <span aria-hidden="true"> *</span>}</>} helper={helper} error={error} id={id}><select ref={ref} id={id} required={required} aria-invalid={error ? 'true' : undefined} aria-errormessage={error ? helpId : undefined} aria-describedby={!error ? helpId : undefined} className={classes('admin-select', className)} {...props}>{children}</select></FieldShell>;
});
export const AdminTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function AdminTextarea({ label, helper, error, id: supplied, className, required, ...props }, ref) {
  const generated = useId(), id = supplied || generated, helpId = helper || error ? `${id}-help` : undefined;
  return <FieldShell label={<>{label}{required && <span aria-hidden="true"> *</span>}</>} helper={helper} error={error} id={id}><textarea ref={ref} id={id} required={required} aria-invalid={error ? 'true' : undefined} aria-errormessage={error ? helpId : undefined} aria-describedby={!error ? helpId : undefined} className={classes('admin-textarea', className)} {...props}/></FieldShell>;
});
export const AdminCheckbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; helper?: ReactNode }>(function AdminCheckbox({ label, helper, id: supplied, className, ...props }, ref) {
  const generated = useId(), id = supplied || generated;
  return <label className={classes('admin-checkbox', className)} htmlFor={id}><input ref={ref} id={id} type="checkbox" {...props}/><span>{label}{helper && <small>{helper}</small>}</span></label>;
});
export const AdminDatePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & FieldProps>(function AdminDatePicker(props, ref) { return <AdminInput ref={ref} type="date" {...props}/>; });
export const AdminSearchField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: string }>(function AdminSearchField({ label = '검색', id: supplied, className, ...props }, ref) {
  const generated = useId(), id = supplied || generated;
  return <label className={classes('admin-search-field', className)} htmlFor={id}><span className="admin-visually-hidden">{label}</span><Search size={16} aria-hidden="true"/><input ref={ref} id={id} type="search" aria-label={label} {...props}/></label>;
});
export function AdminFilterTrigger({ count = 0, children = '필터', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { count?: number }) { return <AdminButton {...props}><SlidersHorizontal size={16}/>{children}{count > 0 && <span>· {count}개</span>}</AdminButton>; }

export function AdminMetricGrid({ columns = 4, className, ...props }: HTMLAttributes<HTMLDivElement> & { columns?: 2 | 4 | 8 }) { return <div className={classes('admin-metric-grid', `admin-metric-grid--${columns}`, className)} {...props}/>; }
export function AdminMetric({ label, value, note, change, className }: { label: ReactNode; value: ReactNode; note?: ReactNode; change?: ReactNode; className?: string }) { return <article className={classes('admin-metric', className)}><h2>{label}</h2><div className="admin-metric-value">{value}</div>{note && <p className="admin-metric-note">{note}</p>}{change && <div className="admin-metric-change">{change}</div>}</article>; }
export function AdminDataTable({ label, children, className, tableClassName, sticky = true, ...props }: HTMLAttributes<HTMLDivElement> & { label: string; children: ReactNode; tableClassName?: string; sticky?: boolean }) {
  const hintId = useId();
  return <div className={classes('admin-table-frame', className)}><p className="admin-table-hint" id={hintId}>표는 좌우로 스크롤할 수 있습니다.</p><div className={classes('admin-table-scroll', sticky && 'admin-table--sticky')} role="region" aria-label={label} aria-describedby={hintId} tabIndex={0} {...props}><table className={classes('admin-data-table', tableClassName)}><caption className="admin-visually-hidden">{label}</caption>{children}</table></div></div>;
}
export function AdminTableToolbar({ result, chips, className, children }: { result?: ReactNode; chips?: ReactNode; className?: string; children: ReactNode }) { return <div className={classes('admin-table-toolbar-wrap', className)}><div className="admin-table-toolbar">{children}{result && <span className="admin-toolbar-result">{result}</span>}</div>{chips && <div className="admin-toolbar-chips">{chips}</div>}</div>; }
export function AdminPagination({ page, pages, onChange, disabled = false }: { page: number; pages: number; onChange: (page: number) => void; disabled?: boolean }) {
  const totalPages = Math.max(1, pages), atStart = page <= 1, atEnd = page >= totalPages;
  return <nav className="admin-pagination" aria-label="페이지 이동"><div className="admin-pagination-actions"><AdminIconButton className="admin-pagination-edge" size="sm" label="첫 페이지" disabled={disabled || atStart} onClick={() => onChange(1)}><ChevronsLeft size={15} aria-hidden="true"/></AdminIconButton><AdminButton size="sm" disabled={disabled || atStart} onClick={() => onChange(page - 1)}><ChevronLeft size={15} aria-hidden="true"/>이전</AdminButton></div><span className="admin-pagination-status" aria-live="polite"><b>{page}</b><span aria-hidden="true"> / </span><span className="admin-visually-hidden">페이지, 총 </span>{totalPages}<span className="admin-visually-hidden">페이지</span></span><div className="admin-pagination-actions"><AdminButton size="sm" disabled={disabled || atEnd} onClick={() => onChange(page + 1)}>다음<ChevronRight size={15} aria-hidden="true"/></AdminButton><AdminIconButton className="admin-pagination-edge" size="sm" label="마지막 페이지" disabled={disabled || atEnd} onClick={() => onChange(totalPages)}><ChevronsRight size={15} aria-hidden="true"/></AdminIconButton></div></nav>;
}

const STATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  draft: { label: '임시저장', tone: 'neutral' }, published: { label: '공개', tone: 'success' }, hidden: { label: '숨김', tone: 'neutral' }, archived: { label: '보관', tone: 'neutral' }, active: { label: '사용 중', tone: 'success' }, inactive: { label: '비활성', tone: 'neutral' }, suspended: { label: '사용 중지', tone: 'warning' }, paused: { label: '일시 중지', tone: 'warning' }, scheduled: { label: '시작 전', tone: 'info' }, recruiting: { label: '모집 중', tone: 'success' }, in_progress: { label: '운영 중', tone: 'info' }, completed: { label: '종료', tone: 'neutral' }, open: { label: '답변 대기', tone: 'warning' }, answered: { label: '답변 완료', tone: 'success' }, pending: { label: '대기', tone: 'warning' }, submitted: { label: '검토 대기', tone: 'warning' }, approved: { label: '승인 완료', tone: 'success' }, returned: { label: '보완 요청', tone: 'warning' }, changes_requested: { label: '보완 요청', tone: 'warning' }, rejected: { label: '반려', tone: 'danger' }, paid: { label: '결제 완료', tone: 'success' }, payment_failed: { label: '결제 실패', tone: 'danger' }, partially_refunded: { label: '부분 환불', tone: 'warning' }, refunded: { label: '환불 완료', tone: 'neutral' }, cancelled: { label: '취소', tone: 'neutral' }, not_configured: { label: '설정 필요', tone: 'warning' }, idle: { label: '동기화 대기', tone: 'neutral' }, syncing: { label: '동기화 중', tone: 'info' }, success: { label: '처리 완료', tone: 'success' }, failed: { label: '처리 실패', tone: 'danger' },
};
export function adminStatus(status: string, fallback = '상태 확인 필요') { return STATUS[status] || { label: fallback, tone: 'neutral' as const }; }
export function AdminStatusBadge({ status, label, tone, className }: { status: string; label?: string; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; className?: string }) { const value = adminStatus(status), text = label || value.label; return <span className={classes('admin-status-badge', `admin-status-badge--${tone || value.tone}`, className)} aria-label={`상태: ${text}`}>{text}</span>; }
export function AdminEmptyState({ title, children, action, compact = false }: { title: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean }) { return <div className={classes('admin-empty-state', compact && 'admin-empty-state--compact')}><Inbox size={compact ? 20 : 24} aria-hidden="true"/><div><strong>{title}</strong>{children && <p>{children}</p>}{action && <div className="admin-state-action">{action}</div>}</div></div>; }
export function AdminSuccessState({ title, children, action, compact = false }: { title: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean }) { return <div className={classes('admin-success-state', compact && 'admin-success-state--compact')} role="status"><CheckCircle2 size={compact ? 20 : 24} aria-hidden="true"/><div><strong>{title}</strong>{children && <p>{children}</p>}{action && <div className="admin-state-action">{action}</div>}</div></div>; }
export function AdminSkeleton({ lines = 3, className, label = '화면 정보를 불러오는 중입니다.' }: { lines?: number; className?: string; label?: string }) { return <div className={classes('admin-skeleton', className)} role="status" aria-live="polite" aria-busy="true"><span className="admin-visually-hidden">{label}</span>{Array.from({ length: lines }, (_, index) => <span aria-hidden="true" key={index}/>)}</div>; }
export function AdminLoadingState({ title = '화면 정보를 불러오는 중입니다.', description = '잠시만 기다려 주세요.' }: { title?: ReactNode; description?: ReactNode }) { return <div className="admin-loading-state" role="status" aria-live="polite" aria-busy="true"><div><strong>{title}</strong>{description && <p>{description}</p>}</div><AdminSkeleton lines={4} label={typeof title === 'string' ? title : undefined}/></div>; }
export function AdminInlineError({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) { return <div className="admin-inline-error" role="alert"><AlertCircle size={18} aria-hidden="true"/><span>{children}</span>{onRetry && <AdminButton size="sm" onClick={onRetry}>다시 시도</AdminButton>}</div>; }

const dialogStack: Array<{ node: HTMLDialogElement; restoreFocus: HTMLElement | null }> = [];
let savedOverflow = '';
function dialogTabStops(node: HTMLDialogElement) {
  return Array.from(node.querySelectorAll<HTMLElement>('a[href],area[href],button,input,select,textarea,summary,iframe,object,embed,[contenteditable],[tabindex]'))
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[hidden],[inert]') && element.closest('dialog') === node && element.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(element).visibility))
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
}
function AdminDialogSurface({ title, onClose, className, children }: { title: string; onClose: () => void; className: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId(), closeHandler = useRef(onClose);
  useEffect(() => { closeHandler.current = onClose; }, [onClose]);
  useEffect(() => {
    const node = dialog.current!, entry = { node, restoreFocus: document.activeElement as HTMLElement | null };
    if (dialogStack.length === 0) savedOverflow = document.body.style.overflow;
    dialogStack.push(entry); node.showModal(); document.body.style.overflow = 'hidden';
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
  return <dialog ref={dialog} className={classes('admin-dialog', className)} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); event.stopPropagation(); closeHandler.current(); }} onClick={event => { if (event.target !== event.currentTarget) return; const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeHandler.current(); }}><header className="admin-dialog-header"><h2 id={titleId}>{title}</h2><AdminIconButton label="닫기" onClick={() => closeHandler.current()}><X size={18}/></AdminIconButton></header>{children}</dialog>;
}
export function AdminDrawer({ title, onClose, size = 'default', children, className }: { title: string; onClose: () => void; size?: 'small' | 'default' | 'large'; children: ReactNode; className?: string }) { return <AdminDialogSurface title={title} onClose={onClose} className={classes('admin-drawer', `admin-drawer--${size}`, className)}>{children}</AdminDialogSurface>; }
export function AdminModal({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) { return <AdminDialogSurface title={title} onClose={onClose} className={classes('admin-modal', className)}>{children}</AdminDialogSurface>; }
export function AdminConfirmDialog({ title = '변경사항 확인', message, confirmLabel = '확인', cancelLabel = '취소', destructive = false, onConfirm, onCancel }: { title?: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) { return <AdminModal title={title} onClose={onCancel}><div className="admin-dialog-body"><p>{message}</p></div><footer className="admin-dialog-footer"><AdminButton onClick={onCancel}>{cancelLabel}</AdminButton><AdminButton tone={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</AdminButton></footer></AdminModal>; }
export function AdminPopover({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) { return <details className={classes('admin-popover', className)}><summary>{label}</summary><div className="admin-popover-panel">{children}</div></details>; }
export function AdminToast({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'danger' }) { return <div className={classes('admin-toast', `admin-toast--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>; }
export function AdminDialogBody(props: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={classes('admin-dialog-body', props.className)}/>; }
export function AdminDialogFooter(props: HTMLAttributes<HTMLElement>) { return <footer {...props} className={classes('admin-dialog-footer', props.className)}/>; }
export type AdminTableProps = TableHTMLAttributes<HTMLTableElement>;
