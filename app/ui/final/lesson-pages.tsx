'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { PublicBlockDocument } from '@/lib/lesson-blocks';
import { lessonEmbeddedImageIds } from '@/lib/lesson-toggle-images';

export const campusLessonTag = '캠퍼스 실습';

export function LessonPages({ document, enabled, busy, children }: {
  document: PublicBlockDocument | null;
  enabled: boolean;
  busy?: boolean;
  children: (blockIds: ReadonlySet<string> | undefined, last: boolean) => ReactNode;
}) {
  const pages = useMemo(() => {
    if (!enabled || !document) return [];
    const embedded = lessonEmbeddedImageIds(document.blocks);
    const groups: Set<string>[] = [];
    for (const block of document.blocks) {
      if (embedded.has(block.id)) continue;
      if (!groups.length || block.type === 'heading') groups.push(new Set());
      groups[groups.length - 1].add(block.id);
    }
    return groups;
  }, [document, enabled]);
  const [index, setIndex] = useState(0);
  const position = useRef<HTMLParagraphElement>(null);
  if (!pages.length) return children(undefined, true);
  const page = Math.min(index, pages.length - 1);
  const last = page === pages.length - 1;
  function move(next: number) {
    setIndex(next);
    position.current?.focus({ preventScroll: true });
    position.current?.scrollIntoView({ block: 'start' });
  }
  return <div className="lb-pages">
    <p ref={position} tabIndex={-1} aria-live="polite" className="lb-page-position">{page + 1} / {pages.length} 페이지</p>
    <progress aria-label="수업 페이지" value={page + 1} max={pages.length} />
    {children(pages[page], last)}
    {pages.length > 1 && <nav aria-label="수업 페이지 이동">
      <button type="button" className="btn" disabled={!page || busy} onClick={() => move(page - 1)}>이전 페이지</button>
      {!last && <button type="button" className="btn primary" disabled={busy} onClick={() => move(page + 1)}>다음 페이지</button>}
    </nav>}
  </div>;
}
