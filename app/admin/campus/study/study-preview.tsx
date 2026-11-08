'use client';

import { useState } from 'react';
import type { LessonBlockAnswers, PublicBlockDocument } from '@/lib/lesson-blocks';
import { LessonPages } from '@/app/ui/final/lesson-pages';
import { LessonBlockView } from '@/app/ui/final/lesson-block-view';
import { LegacyCampusLesson, type CampusMaterial } from '@/app/ui/final/lesson-block-session';
import { ResourceRow } from '@/app/ui/final/primitives';

export function StudyPreview({ lessonId, document, material }: { lessonId: string; document: PublicBlockDocument | null; material: CampusMaterial }) {
  const [values, setValues] = useState<LessonBlockAnswers>({ blocks: {}, checklist: [] });
  return <>
    {material.description && <p>{material.description}</p>}
    {document ? <LessonPages enabled document={document}>{(pageBlocks, last) =>
      <LessonBlockView document={document} pageBlocks={pageBlocks} showChecklist={last} filesReadOnly values={values} onChange={setValues}/>
    }</LessonPages> : <LegacyCampusLesson material={material} lessonId={lessonId} enrollmentId="" readOnly/>}
    {material.resourceName && <ResourceRow content={{id: lessonId, lesson_id: lessonId, resource_name: material.resourceName}}/>}
  </>;
}
