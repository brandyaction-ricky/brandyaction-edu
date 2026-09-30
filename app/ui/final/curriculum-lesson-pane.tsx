"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { Row } from '@/lib/platform';
import type { Data, WorkflowSend } from '../learning-workflows';
import { LearningEditor, type LearningEditorSession } from './learning-editor';

// Load supporting quizzes for the selected lesson; the outline's scoped data is
// authoritative for the course, weeks, lessons and legacy body (not a paged list).
export function CurriculumLessonPane({ lesson, course, curriculum, pending, send, actorId, sessionRef, onSaved, blockEditingEnabled }: {
  lesson: Row; course: Row; curriculum: Data; pending: boolean; send: WorkflowSend;
  actorId: string; sessionRef: Ref<LearningEditorSession>; onSaved: () => void; blockEditingEnabled?: boolean;
}) {
  const [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const editor = useRef<LearningEditorSession>(null);
  useImperativeHandle(sessionRef, () => ({ get dirty() { return editor.current?.dirty || false; }, get busy() { return editor.current?.busy ?? (!data && !error); }, save: () => editor.current?.save() || Promise.resolve(false) }));
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(`/api/platform?admin=1&section=learning&record=${encodeURIComponent(String(lesson.id))}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || '수업 정보를 불러오지 못했습니다.'); return result.data as Data; })
      .then(result => { if (active) { setData(result); setError(''); } })
      .catch(cause => { if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : '수업을 다시 불러와 주세요.'); });
    return () => { active = false; controller.abort(); };
  }, [lesson.id, retry]);
  const sendWithQuizRefresh: WorkflowSend = async (body, success) => {
    const result = await send(body, success);
    if (body.action === 'quiz') {
      // Quiz writes return no revision. Refresh it before another edit so the
      // optimistic concurrency check does not reuse the pre-save revision.
      const response = await fetch(`/api/platform?admin=1&section=learning&record=${encodeURIComponent(String(lesson.id))}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('퀴즈는 저장됐지만 최신 상태를 불러오지 못했습니다. 다시 열어 확인해 주세요.');
      const latest = await response.json();
      setData(latest.data);
    }
    return result;
  };
  if (error) return <p className="notice warning" role="alert">{error} <button className="btn" onClick={() => { setError(''); setRetry(value => value + 1); }}>다시 시도</button></p>;
  if (!data) return <p role="status" className="studio-loading">수업 문서를 불러오고 있습니다…</p>;
  return <LearningEditor embedded actorId={actorId} data={{ ...data, curriculum_weeks: curriculum.curriculum_weeks, curriculum_lessons: curriculum.curriculum_lessons, lesson_contents: curriculum.lesson_contents, courses: [course] }} row={lesson} pending={pending} send={sendWithQuizRefresh} back={() => {}} sessionRef={editor} onSaved={onSaved} blockEditingEnabled={blockEditingEnabled} />;
}
