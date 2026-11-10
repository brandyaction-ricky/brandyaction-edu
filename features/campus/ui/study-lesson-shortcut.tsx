'use client';

import {useLessonProgression} from '@/app/ui/final/use-lesson-progression';
import type {CampusSnapshot} from '../contracts';
import styles from './study-lesson-shortcut.module.css';

type Lesson = CampusSnapshot['lessons'][number];

function pendingPractice(lesson: Lesson) {
  return lesson.missions.find(m => m.status === 'changes_requested' || m.status === 'rejected')
    ?? lesson.missions.find(m => m.required && m.status === 'not_started');
}

export function StudyLessonShortcut({snapshot,onOpen}: {
  snapshot: CampusSnapshot;
  onOpen: (lesson: string, mission?: string) => void;
}) {
  const enrollment = snapshot.selectedEnrollmentId || '';
  const scope = snapshot.scopes.find(s => s.enrollmentId === enrollment);
  const blocks = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
  const gates = useLessonProgression(enrollment, blocks && snapshot.lessons.length > 0, snapshot.fetchedAt);
  const lessons = snapshot.lessons;
  const firstUnfinished = lessons.findIndex(l => !l.completed);
  const unlocked = lessons.filter((lesson, index) => scope?.graduate || (blocks
    ? gates.lessons?.some(g => g.lessonId === lesson.id && g.isUnlocked)
    : lesson.completed || firstUnfinished === index));
  const lesson = unlocked.find(l => !l.completed || (!scope?.graduate && pendingPractice(l))) ?? unlocked.at(-1);
  const mission = lesson && !scope?.graduate ? pendingPractice(lesson) : undefined;

  return <section className={styles.card} aria-label="오늘의 수업·실습">
    <h2>오늘의 수업·실습</h2>
    {lesson ? <>
      <p>{lesson.week !== undefined && (lesson.week === 0 ? '준비 주차' : lesson.week+'주차')}{lesson.week !== undefined && ' · '}{lesson.day}일차 · {lesson.title}</p>
      <div className={styles.actions}>
        <button type="button" onClick={() => onOpen(lesson.id)}>{lesson.completed ? '수업 다시 보기' : '수업 열기'}</button>
        {mission && <button type="button" onClick={() => onOpen(lesson.id,mission.id)}>{mission.status === 'not_started' ? '실습 과제 열기' : '과제 보완하기'}</button>}
      </div>
    </> : gates.error ? <p role="status">수업을 불러오지 못했어요. <button type="button" onClick={gates.reload}>다시 확인</button></p>
      : <p role="status">{blocks && lessons.length > 0 && !gates.lessons ? '열린 수업을 확인하고 있어요.' : '지금 열 수 있는 수업이 없어요.'}</p>}
  </section>;
}
