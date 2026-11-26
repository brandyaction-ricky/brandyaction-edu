'use client';
import {useEffect, useRef, useState} from 'react';
import {DiagnosisEntry} from '@/app/ui/final/diagnosis-entry';
import {FloatingLearningQuestion} from '@/app/ui/final/floating-learning-question';
import {LessonQuestions} from '@/app/ui/final/lesson-questions';
import {NextLessonAction} from '@/app/ui/final/lesson-pages';
import dynamic from 'next/dynamic';
import {useLessonProgression} from '@/app/ui/final/use-lesson-progression';
const GuidedSession = dynamic(() => import('@/app/ui/final/lesson-block-session').then(module => module.LessonBlockSession), {
 loading: () => <p role="status">수업을 여는 중입니다.</p>,
});
import type {CampusSnapshot} from '../contracts';
import {learnerMetrics} from '../learner-metrics';
import {CampusLessonContext} from './draft-guard';
import styles from './lesson-task-panel.module.css';
const statusText:Record<string,string>={not_started:'아직 제출하지 않았어요',submitted:'답변을 기다리고 있어요',approved:'완료했어요',changes_requested:'보완할 내용이 있어요',rejected:'다시 확인해 주세요',unknown:'상태 확인이 필요해요'};

const roomLoading = () => <p role="status">수업 본문을 여는 중입니다.</p>;
const RoomClassroom = dynamic(() => import('./room-classroom').then(module => module.RoomClassroom), { loading: roomLoading });
const RoomPublishedLesson = dynamic(() => import('./room-classroom').then(module => module.RoomPublishedLesson), { loading: roomLoading });
type PanelProps = {
  initialLesson?: string;
  initialMission?: string;
  snapshot: CampusSnapshot;
  live?: boolean;
  mayLeave?: () => boolean;
  onCompleted?: () => void;
  onOpen: (lesson: string, mission?: string) => void;
};
const noop = () => {};
type Lesson = CampusSnapshot['lessons'][number];
function position(lesson: Lesson) {
  return [lesson.week !== undefined && lesson.week + '주차', lesson.day + '일차'].filter(Boolean).join(' · ');
}

export function LessonTaskPanel(props: PanelProps) {
  if (props.live) return <CampusLessonContext.Provider value={true}><RoomLessons {...props}/></CampusLessonContext.Provider>;
  return <DemoTasks {...props}/>;
}

function RoomLessons({snapshot, initialLesson, initialMission, mayLeave, onCompleted = noop}: PanelProps) {
  const enrollment = snapshot.selectedEnrollmentId || '';
  const scope = snapshot.scopes.find(item => item.enrollmentId === enrollment);
  const blocks = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
  const guided = !scope?.externalPartner && blocks && snapshot.guidedLessons === true;
  const progression = useLessonProgression(enrollment, !scope?.externalPartner && blocks, snapshot.fetchedAt);
  const [choice, setChoice] = useState({lesson: initialLesson || '', mission: initialMission});
  const open = (row: Lesson) => Boolean(scope?.externalPartner || scope?.graduate || row.staffPreview ||
    (!row.locked && (!blocks || progression.lessons?.some(gate => gate.lessonId === row.id && gate.isUnlocked))));
  const first = snapshot.lessons.find(row => !row.completed && open(row)) || snapshot.lessons.find(open) || snapshot.lessons[0];
  const lesson = choice.lesson ? snapshot.lessons.find(row => row.id === choice.lesson) : first;
  const lessonId = lesson?.id;
  // Capture the first authorized recommendation once. A completion refresh must not move the reader.
  if (!choice.lesson && lessonId && (!blocks || scope?.externalPartner || progression.lessons)) {
    setChoice({...choice, lesson: lessonId});
  }
  const heading = useRef<HTMLHeadingElement>(null);
  const focusRequested = useRef(false);
  useEffect(() => {
    if (focusRequested.current && heading.current) {
      heading.current.focus({preventScroll: true});
      heading.current.scrollIntoView({block: 'start'});
      focusRequested.current = false;
    }
  }, [lessonId, choice.mission]);
  function navigate(id: string, mission?: string) {
    const next = snapshot.lessons.find(row => row.id === id);
    if (!next || !open(next) || (mission && !next.missions.some(item => item.id === mission)) || (mayLeave && !mayLeave())) return;
    focusRequested.current = true;
    setChoice({lesson: id, mission});
  }
  if (!scope) return <p role="status">이 공간의 수강 권한을 확인할 수 없습니다.</p>;
  const index = lesson ? snapshot.lessons.indexOf(lesson) : -1;
  const previous = snapshot.lessons[index-1], next = snapshot.lessons[index+1];
  const gateReason = (id: string) => progression.lessons?.find(gate => gate.lessonId === id)?.reason;
  const reviewNavigation = <nav className={styles.readerTools} aria-label="수업 이동">{previous && <button type="button" className="btn" disabled={!open(previous)} onClick={() => navigate(previous.id)}>이전 학습</button>}{next && <button type="button" className="btn" disabled={!open(next)} onClick={() => navigate(next.id)}>다음 학습 · {position(next)}</button>}</nav>;
  // The staff publication reader permits review without granting product editing or student writes.
  const review = !!scope.externalPartner || !!lesson?.staffPreview;
  return <section className={styles.reader} aria-label="캠퍼스 수업">
    {snapshot.lessons.length > 0 && <div className={styles.top}><label>수업 선택<select value={lessonId || ''} onChange={event => navigate(event.target.value)}>
      {!lesson && <option value="">수업을 선택해 주세요</option>}
      {snapshot.lessons.map(row => <option key={row.id} value={row.id} disabled={!open(row)}>{position(row)} · {row.title}{row.completed ? ' · 완료' : !open(row) ? ' · 잠김' : ''}</option>)}
    </select></label></div>}
    {!lesson ? <p role="status">{choice.lesson ? '선택한 수업을 현재 공개 목록에서 찾을 수 없어요.' : '아직 공개된 수업이 없어요.'}</p>
      : !open(lesson) ? <p role="status">{progression.error || gateReason(lesson.id) || (blocks && !progression.lessons ? '수업 개방 상태를 확인하고 있어요.' : '아직 열리지 않은 수업입니다.')}{progression.error && <button type="button" className="btn" onClick={progression.reload}>다시 확인</button>}</p>
      : <>
        <h2 ref={heading} tabIndex={-1}>{lesson.title}</h2>
        {review ? <><RoomPublishedLesson key={lesson.id} access={scope.externalPartner ? enrollment : scope.cohortId} lesson={lesson.id} partner={scope.externalPartner}/>
          {reviewNavigation}</>
        : choice.mission || !guided ? <RoomClassroom key={lesson.id + ':' + (choice.mission || '')} scope={scope} lesson={lesson.id} day={lesson.day} title={lesson.title} reviewNavigation={reviewNavigation} progression={progression} mission={choice.mission} onNavigate={navigate} onCompleted={onCompleted}/>
        : <>
          {!lesson.staffPreview && process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true' && <div className={styles.readerTools}><FloatingLearningQuestion key={enrollment + ':' + lesson.id} member={snapshot.viewer.id} current={{enrollmentId: enrollment, lessonId: lesson.id, label: lesson.day + '일차 · ' + lesson.title, recent: true}}/></div>}
          <div className={`edu-front ${styles.regularClassroom}`}>
            <GuidedSession campusGuided lessonId={lesson.id} enrollmentId={enrollment} readOnly={scope.graduate || lesson.staffPreview} completed={lesson.completed}
              onCompleted={onCompleted} renderContinuation={ready => <NextLessonAction end="현재 공개된 마지막 수업입니다." position={next && position(next)}
                reason={!ready ? '학습 완료 또는 제출 후 이동할 수 있어요.' : next && !open(next) ? gateReason(next.id) || '아직 열리지 않은 수업입니다.' : undefined}
                onOpen={() => {if (ready && next) navigate(next.id);}}/>}/>
          </div>
          {previous && <button type="button" className="btn" disabled={!open(previous)} onClick={() => navigate(previous.id)}>이전 학습</button>}
          {!lesson.staffPreview && lesson.missions.length > 0 && <div className={styles.tasks}><h3>이 수업의 과제</h3>{lesson.missions.map(item =>
            <div className={styles.task} key={item.id}><div><strong>{item.title}</strong><p>{statusText[item.status]}</p></div>
              {(!scope.graduate || item.status !== 'not_started') && <button type="button" className="btn" onClick={() => navigate(lesson.id, item.id)}>과제 열기</button>}</div>)}</div>}
          {!lesson.staffPreview && <DiagnosisEntry key={enrollment} courseId={scope.courseId}/>}
          {!lesson.staffPreview && <details key={enrollment+':'+lesson.id}><summary>이 수업의 질문·답변 보기</summary><LessonQuestions enrollmentId={enrollment} lessonId={lesson.id} lessonTitle={lesson.title}/></details>}
        </>}
      </>}
  </section>;
}

function DemoTasks({snapshot, onOpen}: PanelProps) {
 const metrics=learnerMetrics(snapshot),recommended=metrics.nextActions[0];
 const [chosen,setChosen]=useState((snapshot.lessons.find(l=>l.id===recommended?.lessonId&&!l.locked)||snapshot.lessons.find(l=>!l.completed&&!l.locked)||snapshot.lessons[0])?.id||'');
 const lesson=snapshot.lessons.find(l=>l.id===chosen)||snapshot.lessons[0];
 if(!lesson)return <section className={styles.panel}><h2>아직 공개된 수업이 없어요</h2><p>수업이 열리면 이곳에서 이어서 공부할 수 있어요.</p></section>;
 const priority=lesson.missions.find(m=>m.status==='changes_requested'||m.status==='rejected')||lesson.missions.find(m=>m.required&&m.status==='not_started');
 const primaryMission=priority&&(lesson.completed||priority.status!=='not_started')?priority:null;
 const action=primaryMission?(primaryMission.status==='not_started'?'과제 시작하기':'보완 의견 확인하기'):lesson.completed?'수업 다시 보기':'수업 이어보기';
 const scope=snapshot.scopes.find(item=>item.enrollmentId===snapshot.selectedEnrollmentId);
 return <section className={styles.panel} aria-label={lesson.missions.length?'지금 할 수업과 과제':'지금 할 수업'}>
  <DiagnosisEntry key={scope?.enrollmentId} courseId={scope?.courseId}/>
  <div className={styles.top}><label>수업 선택<select value={lesson.id} onChange={e=>setChosen(e.target.value)}>{snapshot.lessons.map(l=><option key={l.id} value={l.id} disabled={l.locked}>{l.week !== undefined ? l.week === 0 ? '준비 주차 · ' : l.week + '주차 · ' : ''}{l.day}일차 · {l.title}{l.completed?' · 완료':l.locked?' · 잠김':''}</option>)}</select></label></div>
  <article className={styles.next}><span className={styles.day}>{lesson.day}일차</span><h2>{lesson.title}</h2><p>{primaryMission?'과제의 안내와 검토 의견을 확인해 주세요.':!lesson.missions.length?(lesson.completed?'필요한 부분을 다시 볼 수 있어요.':'공부하던 수업을 이어서 보세요.'):lesson.completed?'필요한 부분을 다시 보거나 아래에서 과제를 확인하세요.':'공부하던 수업을 이어서 보고, 배운 내용을 과제로 적용해 보세요.'}</p><button className={styles.primary} onClick={()=>onOpen(lesson.id,primaryMission?.id)}>{action}<span aria-hidden="true"> →</span></button></article>
  {lesson.missions.length>0&&<div className={styles.tasks}><h3>이 수업의 과제</h3>{lesson.missions.map(m=><div key={m.id} className={styles.task}><div><strong>{m.title}</strong><p>{statusText[m.status]||'상태 확인이 필요해요'}</p></div>{m.id!==primaryMission?.id&&<button onClick={()=>onOpen(lesson.id,m.id)}>{m.status==='not_started'?'과제 열기':m.status==='changes_requested'||m.status==='rejected'?'검토 의견 보기':'제출 내용 보기'}</button>}</div>)}</div>}
 </section>;
}
