'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicBlockDocument, PublicLessonBlock } from '@/lib/lesson-blocks';
import { lessonBodyPlainText } from '@/lib/lesson-body';
import { practiceSteps } from '@/lib/lesson-practice-steps';
import { lessonReadingPages } from '@/lib/lesson-reading-pages';


export type RenderContinuation = (ready: boolean) => ReactNode;

export function NextLessonAction({ position, onOpen, reason, end }: {
  position?: string;
  onOpen?: () => void;
  reason?: string;
  end: string;
}) {
  if (!position) return <span className="lb-course-end">{end}</span>;
  return <div className="lb-next-lesson">
    <button type="button" className="btn primary" disabled={Boolean(reason)} onClick={onOpen}>
      다음 일차로 · {position}
    </button>
    {reason && <small>{reason}</small>}
  </div>;
}

export function LessonPages({ document, lessonId, enabled, busy, positionKey, continuation, children }: {
  document: PublicBlockDocument | null;
  lessonId?: string;
  enabled: boolean;
  busy?: boolean;
  positionKey?: string;
  continuation?: ReactNode;
  children: (pageBlocks: PublicLessonBlock[] | undefined, last: boolean) => ReactNode;
}) {
  const steps = useMemo(() => enabled && document ? practiceSteps(lessonId, document.blocks) : null, [enabled, document, lessonId]);
  const pages = useMemo(() => steps?.map(step => step.blocks) ?? (enabled && document ? lessonReadingPages(document.blocks) : []), [steps, document, enabled]);
  const labels = useMemo(() => steps?.map(step => step.label) ?? pages.map(page => {
    const first = page.find(b => b.type === 'heading' || b.type === 'subheading')
      || page.find(b => b.content?.trim() || b.question?.label || b.alt);
    return first && lessonBodyPlainText(first.question?.label || first.content || first.alt || '').trim().split('\n')[0].slice(0, 34);
  }), [pages, steps]);
  const [index, setIndex] = useState(() => {
    try { return positionKey ? Math.max(0, Number.parseInt(sessionStorage.getItem(positionKey) || '0', 10) || 0) : 0; }
    catch { return 0; }
  });
  const position = useRef<HTMLParagraphElement>(null);
  if (!pages.length) return <>{children(undefined, true)}{enabled && continuation}</>;
  const page = Math.min(index, pages.length - 1);
  const last = page === pages.length - 1;
  function move(next: number) {
    setIndex(next);
    try { if (positionKey) sessionStorage.setItem(positionKey, String(next)); } catch { /* Storage is optional. */ }
    position.current?.focus({ preventScroll: true });
    position.current?.scrollIntoView({ block: 'start' });
  }
  return <div className="lb-pages">
    <p ref={position} tabIndex={-1} aria-live="polite" className="lb-page-position">{page + 1} / {pages.length} 페이지</p>
    {pages.length > 1 && <label className="lb-page-jump">페이지 이동 <select aria-label="페이지 이동" value={page} disabled={busy} onChange={event => move(Number(event.target.value))}>
      {pages.map((_, n) => <option key={n} value={n}>{n + 1}페이지{labels[n] ? ' · ' + labels[n] : ''}</option>)}
    </select></label>}
    <progress aria-label="수업 페이지" value={page + 1} max={pages.length} />
    {children(pages[page], last)}
    {(pages.length > 1 || continuation) && <nav aria-label="수업 페이지 이동">
      {pages.length > 1 && <button type="button" className="btn" disabled={!page || busy} onClick={() => move(page - 1)}>이전 페이지</button>}
      {!last && <button type="button" className="btn primary" disabled={busy} onClick={() => move(page + 1)}>다음 페이지</button>}
      {last && continuation}
    </nav>}
  </div>;
}
