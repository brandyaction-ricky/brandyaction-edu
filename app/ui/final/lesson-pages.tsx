'use client';

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
    try {
      // Opened from 수업 자료 찾기: start on the task where the searched word appears, once (QA M5).
      const hint = lessonId && sessionStorage.getItem('campus:find:' + lessonId);
      if (hint) { sessionStorage.removeItem('campus:find:' + lessonId); const word = hint.toLowerCase(), at = pages.findIndex(p => JSON.stringify(p).toLowerCase().includes(word)); if (at >= 0) return at; }
      return positionKey ? Math.max(0, Number.parseInt(localStorage.getItem(positionKey) || '0', 10) || 0) : 0;
    }
    catch { return 0; }
  });
  const body = useRef<HTMLDivElement>(null);
  const focusAfterMove = useRef(false);
  // Audio playing when the reader moves on keeps going in a small bar instead of stopping (QA M4).
  const [carry, setCarry] = useState<{ src: string; time: number; rate: number; label: string; page: number } | null>(null);
  const toc = useRef<HTMLElement>(null), start = useRef<HTMLProgressElement>(null);
  function focusTask() {
    body.current?.focus({ preventScroll: true });
    start.current?.scrollIntoView({ block: 'start' });
  }
  useLayoutEffect(() => {
    if (focusAfterMove.current) {
      focusAfterMove.current = false;
      focusTask();
    }
  }, [index]);
  // Keep the current task visible inside the short, scrollable task list.
  useLayoutEffect(() => {
    const list = toc.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !item) return;
    const frame = list.getBoundingClientRect();
    const active = item.getBoundingClientRect();
    if (active.top < frame.top + 4) list.scrollTop += active.top - frame.top - 4;
    else if (active.bottom > frame.bottom - 4) list.scrollTop += active.bottom - frame.bottom + 4;
  }, [index, pages.length]);
  if (!pages.length) return <>{children(undefined, true)}{enabled && continuation}</>;
  const page = Math.min(index, pages.length - 1);
  const last = page === pages.length - 1;
  function move(next: number) {
    const playing = Array.from(body.current?.querySelectorAll('audio') ?? []).find(a => !a.paused && !a.ended && (a.currentSrc || a.src));
    if (playing) setCarry({ src: playing.currentSrc || playing.src, time: playing.currentTime, rate: playing.playbackRate, label: playing.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || playing.getAttribute('aria-label') || '음성 자료', page });
    if (next === index) focusTask();
    else {
      focusAfterMove.current = true;
      setIndex(next);
    }
    try { if (positionKey) localStorage.setItem(positionKey, String(next)); } catch { /* Storage is optional. */ }
  }
  return <div className="lb-pages">
    <p aria-live="polite" className="lb-page-position">오늘의 작업 {page + 1} / {pages.length}</p>
    {pages.length > 1 && <nav ref={toc} aria-label="오늘의 작업 목차" className="lb-page-toc"><ol>
      {pages.map((_, n) => <li key={n}><button type="button" aria-current={n === page ? 'step' : undefined} disabled={busy} onClick={() => move(n)}><span>{n + 1}</span>{labels[n]}</button></li>)}
    </ol></nav>}
    <progress ref={start} aria-label="오늘의 작업 진행" value={page + 1} max={pages.length} />
    {carry && <div className="lb-carry-audio" role="region" aria-label="이어서 듣는 음성">
      <small>{carry.page + 1}번 작업 · {carry.label}</small>
      <audio key={carry.src} src={carry.src} controls autoPlay aria-label={carry.label} onLoadedMetadata={e => { e.currentTarget.currentTime = carry.time; e.currentTarget.playbackRate = carry.rate; }} onEnded={() => setCarry(null)} />
      <button type="button" className="btn small" onClick={() => setCarry(null)}>닫기</button>
    </div>}
    <div ref={body} role="group" aria-label={labels[page]} tabIndex={-1}>{children(pages[page], last)}</div>
    {(pages.length > 1 || continuation) && <nav aria-label="작업 이동">
      {pages.length > 1 && <button type="button" className="btn" disabled={!page || busy} onClick={() => move(page - 1)}>이전 작업</button>}
      {!last && <button type="button" className="btn primary" disabled={busy} onClick={() => move(page + 1)}>다음 작업 · {labels[page + 1]}</button>}
      {last && continuation}
    </nav>}
  </div>;
}
