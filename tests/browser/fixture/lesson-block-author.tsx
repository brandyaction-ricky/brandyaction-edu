import { useState } from 'react';
import { LearningEditor } from '../../../app/ui/final/learning-editor';
import { Classroom } from '../../../app/ui/final/classroom';
import '../../../app/ui/final/learning-editor.css';
import '../../../app/ui/final/curriculum-editor.css';
import { withExistingCohortVisibility } from './cohort-visibility';

const id = (n: number) => `aaaaaaab-1111-4111-8111-${String(n).padStart(12, '0')}`;
export function LessonBlockAuthorFixture() {
  const newLesson = new URLSearchParams(location.search).has('new');
  const [view, setView] = useState('author'), [visit, setVisit] = useState(0), [saves, setSaves] = useState(0), [legacySaves, setLegacySaves] = useState(0);
  const lesson = { id: id(4), week_id: id(5), day_number: 1, title: new URLSearchParams(location.search).get('serverTitle') || '구성 편집 검수', is_published: true, content_type: 'text' };
  const data = { enrollments: [{ id: id(1), course_id: id(2), cohort_id: id(3), status: 'active' }], courses: [{ id: id(2), title: '합성 과정' }], cohorts: [{ id: id(3), name: '합성 4기' }], curriculum_weeks: [{ id: id(5), course_id: id(2), week_number: 1, title: '학습 구성', is_published: true }], curriculum_lessons: [lesson], lesson_contents: new URLSearchParams(location.search).has('created') ? [] : [{ id: id(7), lesson_id: id(4), body_text: '원래 본문\n[안내 링크](https://example.test/guide)', resource_storage_path: 'synthetic/material.pdf', resource_name: '기존 자료.pdf' }], lesson_progress: [] };
  if (new URLSearchParams(location.search).has('imports')) {
    data.curriculum_lessons.push({ ...lesson, id: id(8), day_number: 2, title: '가져올 원본 학습' }, { ...lesson, id: id(9), day_number: 3, title: '다른 원본 학습' });
    data.curriculum_weeks.push({ id: id(20), course_id: id(21), week_number: 1, title: '다른 상품', is_published: true });
    data.curriculum_lessons.push({ ...lesson, id: id(22), week_id: id(20), title: '다른 상품 비공개 학습' });
  }
  return <main style={{ padding: 20 }}>
    <nav><button type="button" onClick={() => { setView('author'); setVisit(value => value + 1); }}>편집 다시 열기</button><button type="button" onClick={() => setView('learner')}>학생 화면 보기</button></nav>
    <output aria-label="기본 정보 저장 횟수">{saves}</output><output aria-label="기존 본문 변경 횟수">{legacySaves}</output>
    {view === 'author' ? <div className="adm edu-admin"><div className="curriculum-editor-page"><LearningEditor embedded={new URLSearchParams(location.search).has('embedded')} serverDraftsEnabled={new URLSearchParams(location.search).has('serverDraft')} key={visit} data={{...data,...(new URLSearchParams(location.search).has('quiz') ? {curriculum_missions:[{id:id(40),lesson_id:id(4),title:'별도 미션 퀴즈'}]} : {})}} row={newLesson ? undefined : lesson} actorId={new URLSearchParams(location.search).get('actor') || id(90)} blockEditingEnabled pending={false} back={() => setView('closed')} send={async body => { if (body.section === 'learning') setSaves(value => value + 1); if (body.section === 'contents') setLegacySaves(value => value + 1); return { row: lesson }; }} /></div></div>
      : view === 'learner' ? <div className="edu-front"><Classroom path={['learn', id(1), id(4)]} data={withExistingCohortVisibility(data)} pending={false} loading={false} missionId={null} blockLearningEnabled send={async () => ({})} /></div> : <p>목록으로 돌아왔습니다.</p>}
  </main>;
}
