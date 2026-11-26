'use client';

import {useRef, useState, type ReactNode} from 'react';
import {Classroom} from '@/app/ui/final/classroom';
import type {useLessonProgression} from '@/app/ui/final/use-lesson-progression';
import {FloatingLearningQuestion} from '@/app/ui/final/floating-learning-question';
import {ReviewBody, useReviewRead} from '@/app/ui/final/staff-curriculum-review';
import type {Data, WorkflowSend} from '@/app/ui/learning-workflows';
import {createMutationGate} from '@/lib/mutation-gate';
import {hasLearningAccess} from '@/lib/platform-rules';
import {reviewUrl, type CurriculumReview, type ReviewContent} from '@/lib/staff-curriculum-review';
import type {CampusScope} from '../contracts';
import {useCampusDraftGuard} from './draft-guard';
import styles from './lesson-task-panel.module.css';

export function RoomPublishedLesson({access, lesson, partner = false}: {access: string; lesson: string; partner?: boolean}) {
  const result = useReviewRead<ReviewContent>(reviewUrl(access, lesson, false, partner));
  if (result.error) return <p role="alert">{result.error} <button className="btn" onClick={result.retry}>수업 다시 확인</button></p>;
  if (!result.data) return <p role="status">공개 수업을 불러오고 있어요.</p>;
  return <><p className="meta">읽기 전용 · 학습 기록은 저장되지 않습니다.</p>
    <ReviewBody key={lesson + ':' + result.data.revision} content={result.data} cohort={access} lesson={lesson} student={false} partner={partner}/></>;
}

// Staff without an enrollment use the same server-checked list and published revision as curriculum review.
export function OperatorRoomCurriculum({initialCohort}: {initialCohort?: string}) {
  const [cohort, setCohort] = useState(initialCohort || '');
  const [selected, setSelected] = useState('');
  const result = useReviewRead<CurriculumReview>('/api/platform/curriculum-review?' + new URLSearchParams(cohort ? {cohort} : {}));
  if (result.error) return <p role="alert">{result.error} <button className="btn" onClick={result.retry}>다시 확인</button></p>;
  const data = result.data;
  if (!data) return <p role="status">공개 커리큘럼을 불러오고 있어요.</p>;
  const lesson = data.lessons.find(row => row.id === selected) || data.lessons[0];
  const index = lesson ? data.lessons.indexOf(lesson) : -1;
  const previous = data.lessons[index - 1], next = data.lessons[index + 1];
  return <section className={styles.reader} aria-label="공개 커리큘럼">
    <div className={styles.top}><label>과정·기수<select value={data.cohortId} onChange={event => {setCohort(event.target.value); setSelected('');}}>
      {data.cohorts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>
    {lesson && <label>수업 선택<select value={lesson.id} onChange={event => setSelected(event.target.value)}>
      {data.lessons.map(row => <option key={row.id} value={row.id}>{row.week}주차 · {row.day}일차 · {row.title}</option>)}
    </select></label>}</div>
    {lesson ? <><h2>{lesson.title}</h2><RoomPublishedLesson access={data.cohortId} lesson={lesson.id}/>
      <nav className={styles.readerTools} aria-label="수업 이동">
        {previous && <button type="button" className="btn" onClick={() => setSelected(previous.id)}>이전 학습</button>}
        {next && <button type="button" className="btn" onClick={() => setSelected(next.id)}>다음 학습 · {next.day}일차</button>}
      </nav></> : <p>이 기수에 공개된 수업이 없어요.</p>}
  </section>;
}

type RoomClassroomProps = {
  scope: CampusScope;
  lesson: string;
  day: number;
  title: string;
  reviewNavigation: ReactNode;
  progression: ReturnType<typeof useLessonProgression>;
  mission?: string;
  onNavigate: (lesson: string, mission?: string) => void;
  onCompleted: () => void;
};
export function RoomClassroom({scope, lesson, day, title, reviewNavigation, progression, mission, onNavigate, onCompleted}: RoomClassroomProps) {
  const result = useReviewRead<{user: {id: string; role: string}; data: Data}>('/api/platform?' + new URLSearchParams({
    view: 'member', section: 'learn', enrollment: scope.enrollmentId, lesson,
  }), true);
  const mutation = useRef(createMutationGate<Record<string, unknown>>());
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  useCampusDraftGuard(false, pending, 'campus-classroom');
  const send: WorkflowSend = (body, message) => mutation.current(body, async payload => {
    setPending(true);
    try {
      const response = await fetch(body.workflow ? '/api/platform/workflows' : '/api/platform', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || '저장하지 못했습니다.');
      setNotice(saved.message || message || '저장했습니다.');
      result.retry();
      onCompleted();
      return saved;
    } catch (error) {
      setNotice((error as Error).message);
      throw error;
    } finally {setPending(false);}
  });
  if (result.error) return <p role="alert">{result.error} <button className="btn" onClick={result.retry}>수업 다시 확인</button></p>;
  if (!result.data) return <p role="status">수업 본문을 불러오고 있어요.</p>;
  if (!result.data.user || !result.data.data) return <p role="alert">수강 정보를 확인할 수 없습니다. <button className="btn" onClick={result.retry}>다시 확인</button></p>;
  const data = result.data.data;
  if (!data.enrollments?.some(row => row.id === scope.enrollmentId && hasLearningAccess(row))) {
    return <p role="status">수강 권한을 확인할 수 없습니다. <button className="btn" onClick={result.retry}>권한 다시 확인</button></p>;
  }
  if (!data.curriculum_lessons?.some(row => row.id === lesson)) return <p role="status">이 기수의 공개 수업을 확인할 수 없습니다. <button className="btn" onClick={result.retry}>다시 확인</button></p>;
  // Match the classroom's existing staff review mode instead of recording learner progress.
  if (!mission && ['admin', 'staff'].includes(result.data.user.role)) return <><RoomPublishedLesson access={scope.cohortId} lesson={lesson}/>{reviewNavigation}</>;
  const path = ['learn', scope.enrollmentId, lesson, ...(mission ? ['mission'] : [])];
  const question = process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true' && <div className={styles.readerTools}>
      <FloatingLearningQuestion externalTriggerOnly={!mission} member={result.data.user.id} current={{enrollmentId: scope.enrollmentId, lessonId: lesson, label: day + '일차 · ' + title, recent: true}}/>
    </div>;
  return <div className={`edu-front ${styles.regularClassroom}`}>{notice && <p role="status">{notice}</p>}<Classroom path={path} data={result.data.data} pending={pending}
    send={send} loading={false} progression={progression} missionId={mission || null} room={{day, question, navigate: onNavigate, completed: onCompleted}}/>
  </div>;
}
