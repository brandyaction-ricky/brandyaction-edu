'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { mentorRepliesReadEvent } from '@/lib/question-hub';
import { questionRequest } from './question-composer';
import './mentor-reply-bell.css';

type ReplySummary = { count: number; questions: { id: string; title: string; count: number }[] };

export function MentorReplyBell() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ReplySummary>();
  const [failed, setFailed] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let request: AbortController | undefined;

    function refresh() {
      if (document.visibilityState === 'hidden') return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort('timeout'), 5000);
      void questionRequest<ReplySummary>('/api/platform/question-hub?mode=reply-notifications', undefined, controller.signal)
        .then(data => { if (!controller.signal.aborted) { setSummary(data); setFailed(false); } })
        .catch(() => { if (!controller.signal.aborted || controller.signal.reason === 'timeout') setFailed(true); })
        .finally(() => clearTimeout(timeout));
    }

    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener(mentorRepliesReadEvent, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      request?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(mentorRepliesReadEvent, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !wrapper.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const count = summary?.count ?? 0;
  return <div className="mentor-reply-bell" ref={wrapper} onKeyDown={event => {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button ref={trigger} className="icon-btn mentor-reply-trigger" type="button"
      aria-label={count ? `멘토 답변 알림 ${count}개` : '멘토 답변 알림'}
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>
      <Bell size={19} aria-hidden="true"/>
      {count > 0 && <span className="mentor-reply-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </button>
    {open && <section className="mentor-reply-panel" id={id} aria-label="멘토 답변 알림">
      <h2>멘토 답변 알림</h2>
      {summary?.questions.length ? <ul>{summary.questions.map(question => <li key={question.id}>
        <Link href={'/my/questions?view=mine&question=' + encodeURIComponent(question.id)} onClick={() => setOpen(false)}>
          <span>{question.title}</span><small>새 답변 {question.count}개</small>
        </Link>
      </li>)}</ul> : <p>{failed ? '알림을 불러오지 못했어요.' : summary ? '새 멘토 답변이 없어요.' : '알림을 불러오는 중이에요.'}</p>}
      <Link className="mentor-reply-all" href="/my/questions?view=mine" onClick={() => setOpen(false)}>내 질문 모두 보기</Link>
    </section>}
  </div>;
}
