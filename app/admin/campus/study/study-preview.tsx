'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LessonBlockAnswers, PublicBlockDocument } from '@/lib/lesson-blocks';
import { LessonPages, NextLessonAction } from '@/app/ui/final/lesson-pages';
import { LessonBlockView } from '@/app/ui/final/lesson-block-view';
import { LegacyCampusLesson, type CampusMaterial } from '@/app/ui/final/lesson-block-session';
import { ResourceRow } from '@/app/ui/final/primitives';

export function StudyPreview({ lessonId, cohort, nextLesson, document, material, inCampus = false }: { inCampus?: boolean; cohort: string; nextLesson?: { id: string; position: string }; lessonId: string; document: PublicBlockDocument | null; material: CampusMaterial }) {
  const [values, setValues] = useState<LessonBlockAnswers>({ blocks: {}, checklist: [] });
  const router = useRouter();
  useEffect(() => {
    if (window.location.hash === '#review-lesson') {
      const heading = window.document.getElementById('review-lesson');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start' });
    }
  }, [lessonId]);
  const needsCheck = document?.checklist.some(item => item.required && !values.checklist.includes(item.id));
  const continuation = <NextLessonAction position={nextLesson?.position} end="전체 커리큘럼의 마지막 수업입니다."
    reason={needsCheck ? '필수 체크 항목을 확인해 주세요.' : undefined}
    onOpen={() => {
      if (nextLesson) router.push('/admin/campus/study?' + new URLSearchParams({ cohort, lesson: nextLesson.id, ...(inCampus && {view:'campus'}) }) + '#review-lesson');
    }}/>;
  return <>
    {material.description && <p>{material.description}</p>}
    {document ? <LessonPages continuation={continuation} enabled document={document}>{(pageBlocks, last) =>
      <LessonBlockView document={document} pageBlocks={pageBlocks} showChecklist={last} filesReadOnly values={values} onChange={setValues}/>
    }</LessonPages> : <LegacyCampusLesson material={material} lessonId={lessonId} enrollmentId="" readOnly renderContinuation={() => continuation}/>}
    {material.resourceName && <ResourceRow content={{id: lessonId, lesson_id: lessonId, resource_name: material.resourceName}}/>}
  </>;
}
