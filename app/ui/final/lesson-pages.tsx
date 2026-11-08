'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicBlockDocument, PublicLessonBlock } from '@/lib/lesson-blocks';
import { lessonBodyPlainText } from '@/lib/lesson-body';
import { lessonReadingPages } from '@/lib/lesson-reading-pages';


export function LessonPages({ document, enabled, busy, positionKey, children }: {
  document: PublicBlockDocument | null;
  enabled: boolean;
  busy?: boolean;
  positionKey?: string;
  children: (pageBlocks: PublicLessonBlock[] | undefined, last: boolean) => ReactNode;
}) {
  const pages = useMemo(() => enabled && document ? lessonReadingPages(document.blocks) : [], [document, enabled]);
  const labels = useMemo(() => pages.map(page => {
    const first = page.find(b => b.type === 'heading' || b.type === 'subheading')
      || page.find(b => b.content?.trim() || b.question?.label || b.alt);
    return first && lessonBodyPlainText(first.question?.label || first.content || first.alt || '').trim().split('\n')[0].slice(0, 34);
  }), [pages]);
  const [index, setIndex] = useState(() => {
    try { return positionKey ? Math.max(0, Number.parseInt(sessionStorage.getItem(positionKey) || '0', 10) || 0) : 0; }
    catch { return 0; }
  });
  const position = useRef<HTMLParagraphElement>(null);
  if (!pages.length) return children(undefined, true);
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
    {pages.length > 1 && <nav aria-label="수업 페이지 이동">
      <button type="button" className="btn" disabled={!page || busy} onClick={() => move(page - 1)}>이전 페이지</button>
      {!last && <button type="button" className="btn primary" disabled={busy} onClick={() => move(page + 1)}>다음 페이지</button>}
    </nav>}
  </div>;
}
