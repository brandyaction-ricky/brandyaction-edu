"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight } from 'lucide-react';
import { text as t, type Row } from '@/lib/platform';
import type { Data, WorkflowSend } from '../learning-workflows';
import { AdminHeading } from './admin-shell';
import { ProductCurriculumWorkspace, type CurriculumNavigation } from './product-curriculum-workspace';
import './curriculum-editor.css';

type Recent = { courseId: string; lessonId: string };
export function CurriculumEditor({ data, pending, send, actorId, initialCourseId = '', initialLessonId = '', blockEditingEnabled }: {
  data: Data; pending: boolean; send: WorkflowSend; actorId: string;
  initialCourseId?: string; initialLessonId?: string; blockEditingEnabled?: boolean;
}) {
  const allCourses = data.courses || [];
  const courses = allCourses.filter(item => !item.archived_at);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [selection, setSelection] = useState<Recent | null>(null);
  const [ready, setReady] = useState(false);
  const navigation = useRef<CurriculumNavigation>(null);
  const memoryKey = `edu.curriculum.recent.v1:${actorId}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
    let previous: Recent | null = null;
    try { const raw = JSON.parse(localStorage.getItem(memoryKey) || 'null'); if (raw && typeof raw.courseId === 'string' && typeof raw.lessonId === 'string') previous = raw; } catch { /* Storage is optional, never block authoring. */ }
    const courseId = initialCourseId || previous?.courseId || '';
    setRecent(previous);
    setSelection(courseId ? { courseId, lessonId: initialLessonId || (previous?.courseId === courseId ? previous.lessonId : '') } : null);
    setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [memoryKey, initialCourseId, initialLessonId]);
  const course = courses.find(item => item.id === selection?.courseId);
  const archivedSelection = allCourses.some(item => item.id === selection?.courseId && item.archived_at);
  function choose(item: Row) {
    const next = () => setSelection({ courseId: String(item.id), lessonId: recent?.courseId === item.id ? recent.lessonId : '' });
    if (course && navigation.current) navigation.current.leave(next); else next();
  }
  const studio = useMemo(() => ({ actorId, initialLessonId: selection?.lessonId, navigationRef: navigation, blockEditingEnabled,
    onLessonChange: (lessonId: string) => {
      if (!selection?.courseId) return;
      const value = { courseId: selection.courseId, lessonId };
      setRecent(value);
      try { localStorage.setItem(memoryKey, JSON.stringify(value)); } catch { /* Private browsing may disallow storage. */ }
    },
  }), [actorId, memoryKey, selection, blockEditingEnabled]);
  return <div className="curriculum-editor-page">
    <AdminHeading title="커리큘럼 편집" eyebrow="CURRICULUM" description="수업 제목을 누르고, 문서에 바로 작성하세요." />
    {!ready ? <p role="status">최근 편집한 상품을 확인하고 있습니다…</p> : course ? <>
      <div className="studio-product-bar"><label>편집할 상품<select value={String(course.id)} disabled={pending} onChange={event => { const item = courses.find(row => row.id === event.target.value); if (item) choose(item); }}>{courses.map(item => <option key={String(item.id)} value={String(item.id)}>{t(item, 'title')}</option>)}</select></label><p>같은 상품의 모든 기수가 이 커리큘럼을 함께 사용합니다.<br /><span>수업 편집은 초안으로 저장되며, ‘학생 화면에 반영’을 눌러야 적용됩니다.</span></p></div>
      <ProductCurriculumWorkspace key={String(course.id)} course={course} pending={pending} send={send} studio={studio} />
    </> : <section className="studio-product-picker" aria-label="커리큘럼을 편집할 상품 선택">
      {archivedSelection && <p role="status"><strong>삭제된 상품의 커리큘럼입니다.</strong><br />다시 편집하려면 <Link href="/admin/products">상품·판매 설정</Link>에서 ‘삭제된 상품’을 선택한 뒤 ‘복원’을 눌러 주세요.</p>}
      <h2>어떤 상품의 수업을 작성할까요?</h2><p>상품을 고르면 주차와 수업이 한 화면에 열립니다.</p>
      <div>{courses.map(item => <button type="button" key={String(item.id)} onClick={() => choose(item)}><BookOpen size={22} /><span><b>{t(item, 'title')}</b><small>커리큘럼 열기</small></span><ChevronRight size={20} /></button>)}</div>
      {!courses.length && <p>편집할 상품이 없습니다. 상품·판매 설정에서 상품을 등록하거나 삭제된 상품을 복원해 주세요.</p>}
    </section>}
  </div>;
}
