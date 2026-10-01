import { useState } from 'react';
import { CurriculumEditor } from '../../../app/ui/final/curriculum-editor';
import type { Row } from '../../../lib/platform';
import '../../../app/ui/final/learning-editor.css';

export function CurriculumEditorFixture() {
  const params = new URLSearchParams(location.search);
  const [courses, setCourses] = useState<Row[]>(() => [
    { id: 'course-one', title: 'AI 문샷 챌린지' },
    { id: 'course-two', title: '다른 과정' },
    ...(params.has('productArchive') ? [
      { id: 'course-archived', title: '삭제한 테스트 상품', status: 'archived', archived_at: '2026-10-01T01:00:00Z' },
      { id: 'course-stopped', title: '판매를 종료한 상품', status: 'archived', archived_at: null },
    ] : []),
  ]);
  const [pending, setPending] = useState(false);
  return <main className="edu-admin" style={{ padding: 16 }}>
    {params.has('productArchive') && <button type="button" onClick={() => setCourses(current => current.map(course => course.id === 'course-archived' ? { ...course, archived_at: null, status: 'draft' } : course))}>합성 삭제 상품 복원</button>}
    <CurriculumEditor actorId={params.get('actor') || 'editor-one'} initialCourseId={params.get('course') || ''} initialLessonId={params.get('lesson') || ''} blockEditingEnabled={params.has('blocks')} data={{ courses }} pending={pending} send={async body => {
    setPending(true);
    try { const response = await fetch('/studio-save', { method: 'POST', body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }
    finally { setPending(false); }
  }} /></main>;
}
