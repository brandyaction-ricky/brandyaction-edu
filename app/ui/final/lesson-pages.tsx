'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicBlockDocument, PublicLessonBlock } from '@/lib/lesson-blocks';
import { practiceSteps } from '@/lib/lesson-practice-steps';
import { lessonSections, withoutBlankPages } from '@/lib/lesson-reading-pages';


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
  // Big-task units: the reviewed step plan, else one section per heading. Inside a unit the reader scrolls.
  const shown = useMemo(() => {
    if (!enabled || !document) return [];
    if (steps) return withoutBlankPages(steps.map(step => step.blocks), steps.map(step => step.label));
    const sections = lessonSections(document.blocks);
    return withoutBlankPages(sections.map(s => s.blocks), sections.map(s => s.label));
  }, [steps, document, enabled]);
  const pages = shown.map(p => p.blocks), labels = shown.map((p, n) => p.label || (n ? `작업 ${n + 1}` : '오늘의 시작'));
  const [index, setIndex] = useState(() => {
    try { return positionKey ? Math.max(0, Number.parseInt(localStorage.getItem(positionKey) || '0', 10) || 0) : 0; }
    catch { return 0; }
  });
  const position = useRef<HTMLParagraphElement>(null);
  if (!pages.length) return <>{children(undefined, true)}{enabled && continuation}</>;
  const page = Math.min(index, pages.length - 1);
  const last = page === pages.length - 1;
  function move(next: number) {
    setIndex(next);
    try { if (positionKey) localStorage.setItem(positionKey, String(next)); } catch { /* Storage is optional. */ }
    position.current?.focus({ preventScroll: true });
    position.current?.scrollIntoView({ block: 'start' });
  }
  return <div className="lb-pages">
    <p ref={position} tabIndex={-1} aria-live="polite" className="lb-page-position">오늘의 작업 {page + 1} / {pages.length} · {labels[page]}</p>
    {pages.length > 1 && <nav aria-label="오늘의 작업 목차" className="lb-page-toc"><ol>
      {pages.map((_, n) => <li key={n}><button type="button" aria-current={n === page ? 'step' : undefined} disabled={busy} onClick={() => move(n)}><span>{n + 1}</span>{labels[n]}</button></li>)}
    </ol></nav>}
    <progress aria-label="오늘의 작업 진행" value={page + 1} max={pages.length} />
    {children(pages[page], last)}
    {(pages.length > 1 || continuation) && <nav aria-label="작업 이동">
      {pages.length > 1 && <button type="button" className="btn" disabled={!page || busy} onClick={() => move(page - 1)}>이전 작업</button>}
      {!last && <button type="button" className="btn primary" disabled={busy} onClick={() => move(page + 1)}>다음 작업 · {labels[page + 1]}</button>}
      {last && continuation}
    </nav>}
  </div>;
}
