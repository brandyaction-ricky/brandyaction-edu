'use client';
import {useEffect, useRef, useState} from 'react';
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
import styles from './lesson-task-panel.module.css';
const statusText:Record<string,string>={not_started:'아직 제출하지 않았어요',submitted:'답변을 기다리고 있어요',approved:'완료했어요',changes_requested:'보완할 내용이 있어요',rejected:'다시 확인해 주세요',unknown:'상태 확인이 필요해요'};
/** One lesson and its next action. The full progress dashboard lives outside the room. */
export function LessonTaskPanel({snapshot,onOpen,live,mayLeave,onCompleted,initialLesson}:{initialLesson?:string;snapshot:CampusSnapshot;live?:boolean;mayLeave?:()=>boolean;onCompleted?:()=>void;onOpen:(lesson:string,mission?:string)=>void}){
 const metrics=learnerMetrics(snapshot),recommended=metrics.nextActions[0];
 const [chosen,setChosen]=useState(initialLesson||recommended?.lessonId||snapshot.lessons[0]?.id||'');
 const lesson=snapshot.lessons.find(l=>l.id===chosen)||snapshot.lessons[0];
 const enrollment = snapshot.selectedEnrollmentId || '';
 const enabled = !!live && snapshot.guidedLessons === true && process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
 const gates = useLessonProgression(enrollment, enabled, snapshot.fetchedAt);
 const [reading, setReading] = useState(initialLesson || '');
 const gate = gates.lessons?.find(row => row.lessonId === lesson?.id);
 const heading = useRef<HTMLHeadingElement>(null);
 const focusNext = useRef(false);
 useEffect(() => {
   if (focusNext.current && heading.current) {
     focusNext.current = false;
     heading.current.focus({preventScroll:true});
     heading.current.scrollIntoView({block:'start'});
   }
 }, [reading]);
 const next = lesson && snapshot.lessons[snapshot.lessons.indexOf(lesson) + 1];
 const nextGate = next && gates.lessons?.find(row => row.lessonId === next.id);
 const graduate = snapshot.scopes.find(scope => scope.enrollmentId === enrollment)?.graduate;
 if (enabled && lesson && reading === lesson.id && gate?.isUnlocked) return <section className={styles.reader} aria-label="캠퍼스 수업">
   <div className={styles.readerTools}><button type="button" className="btn small" onClick={() => {
     if (!mayLeave || mayLeave()) { setReading(''); gates.reload(); }
   }}>수업 목록으로</button>
     {process.env.NEXT_PUBLIC_EDU_QUESTION_HUB_ENABLED === 'true' && <FloatingLearningQuestion key={enrollment+':'+lesson.id} member={snapshot.viewer.id} current={{enrollmentId:enrollment,lessonId:lesson.id,label:lesson.day+'일차 · '+lesson.title,recent:true}}/>}
   </div>
   <h2 ref={heading} tabIndex={-1}>{lesson.title}</h2>
   <GuidedSession campusGuided lessonId={lesson.id} enrollmentId={enrollment}
     readOnly={graduate} completed={lesson.completed} onCompleted={onCompleted}
     renderContinuation={ready => <NextLessonAction
       end="현재 공개된 마지막 수업입니다."
       position={next && [next.week !== undefined && next.week + '주차', next.day + '일차'].filter(Boolean).join(' · ')}
       reason={!ready ? '학습 완료 또는 제출 후 이동할 수 있어요.' : !nextGate?.isUnlocked ? nextGate?.reason || '아직 열리지 않은 수업입니다.' : undefined}
       onOpen={() => {
         if (!ready || !next || !nextGate?.isUnlocked || (mayLeave && !mayLeave())) return;
         focusNext.current = true;
         setChosen(next.id);
         setReading(next.id);
       }}/>} />
   <details key={enrollment+':'+lesson.id}><summary>이 수업의 질문·답변 보기</summary>
     <LessonQuestions enrollmentId={enrollment} lessonId={lesson.id} lessonTitle={lesson.title}/>
   </details>
 </section>;
 if(!lesson)return <section className={styles.panel}><h2>아직 공개된 수업이 없어요</h2><p>수업이 열리면 이곳에서 이어서 공부할 수 있어요.</p></section>;
 const priority=lesson.missions.find(m=>m.status==='changes_requested'||m.status==='rejected')||lesson.missions.find(m=>m.required&&m.status==='not_started');
 const primaryMission=priority&&(lesson.completed||priority.status!=='not_started')?priority:null;
 const action=primaryMission?(primaryMission.status==='not_started'?'과제 시작하기':'보완 의견 확인하기'):lesson.completed?'수업 다시 보기':'수업 이어보기';
 return <section className={styles.panel} aria-label="지금 할 수업과 과제">
  {enabled && gates.error && <p role="alert">{gates.error} <button type="button" onClick={gates.reload}>실습 목록 다시 불러오기</button></p>}
  <div className={styles.top}><span>한 번에 한 걸음씩</span><label>수업 선택<select value={lesson.id} onChange={e=>setChosen(e.target.value)}>{snapshot.lessons.map(l=><option key={l.id} value={l.id}>{l.week !== undefined ? l.week === 0 ? '준비 주차 · ' : l.week + '주차 · ' : ''}{l.day}일차 · {l.title}</option>)}</select></label></div>
  <article className={styles.next}><span className={styles.day}>{lesson.day}일차</span><h2>{lesson.title}</h2><p>{primaryMission?'과제의 안내와 검토 의견을 확인해 주세요.':lesson.completed?'필요한 부분을 다시 보거나 아래에서 과제를 확인하세요.':'공부하던 수업을 이어서 보고, 배운 내용을 과제로 적용해 보세요.'}</p>{enabled ? <>
    <button className={styles.primary} disabled={!gate?.isUnlocked} onClick={() => setReading(lesson.id)}>{lesson.completed ? '캠퍼스에서 다시 보기' : '캠퍼스에서 수업 열기'}</button>
    {!gate?.isUnlocked && <p role="status">{gate?.reason || (gates.lessons ? '수업 개방 상태를 확인해 주세요.' : '수업 개방 상태를 확인하고 있어요.')}</p>}
    {primaryMission && <button onClick={() => onOpen(lesson.id,primaryMission.id)}>{action}</button>}
  </> : <button className={styles.primary} onClick={()=>onOpen(lesson.id,primaryMission?.id)}>{live && !primaryMission ? '기존 강의실에서 수업 열기' : action}<span aria-hidden="true"> →</span></button>}</article>
  <div className={styles.tasks}><h3>이 수업의 과제</h3>{!lesson.missions.length?<p>별도로 제출할 과제가 없어요.</p>:lesson.missions.map(m=><div key={m.id} className={styles.task}><div><strong>{m.title}</strong><p>{statusText[m.status]||'상태 확인이 필요해요'}</p></div>{m.id!==primaryMission?.id&&<button onClick={()=>onOpen(lesson.id,m.id)}>{m.status==='not_started'?'과제 열기':m.status==='changes_requested'||m.status==='rejected'?'검토 의견 보기':'제출 내용 보기'}</button>}</div>)}</div>
  <p className={styles.hint}>위의 닫기 버튼 또는 Esc를 누르면 원래 공간으로 돌아가요.</p>
 </section>;
}
