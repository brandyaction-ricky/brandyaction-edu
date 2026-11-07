'use client';
import {useState} from 'react';
import dynamic from 'next/dynamic';
import {useLessonProgression} from '@/app/ui/final/use-lesson-progression';
import {campusLessonTag} from '@/app/ui/final/lesson-pages';
const GuidedSession = dynamic(() => import('@/app/ui/final/lesson-block-session').then(module => module.LessonBlockSession), {
 loading: () => <p role="status">수업을 여는 중입니다.</p>,
});
import type {CampusSnapshot} from '../contracts';
import {learnerMetrics} from '../learner-metrics';
import styles from './lesson-task-panel.module.css';
const statusText:Record<string,string>={not_started:'아직 제출하지 않았어요',submitted:'답변을 기다리고 있어요',approved:'완료했어요',changes_requested:'보완할 내용이 있어요',rejected:'다시 확인해 주세요',unknown:'상태 확인이 필요해요'};
/** One lesson and its next action. The full progress dashboard lives outside the room. */
export function LessonTaskPanel({snapshot,onOpen,live,mayLeave,onCompleted}:{snapshot:CampusSnapshot;live?:boolean;mayLeave?:()=>boolean;onCompleted?:()=>void;onOpen:(lesson:string,mission?:string)=>void}){
 const metrics=learnerMetrics(snapshot),recommended=metrics.nextActions[0];
 const [chosen,setChosen]=useState(recommended?.lessonId||snapshot.lessons[0]?.id||'');
 const lesson=snapshot.lessons.find(l=>l.id===chosen)||snapshot.lessons[0];
 const enrollment = snapshot.selectedEnrollmentId || '';
 const enabled = !!live && process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED === 'true';
 const gates = useLessonProgression(enrollment, enabled);
 const [reading, setReading] = useState('');
 const pilots = snapshot.lessons.flatMap(item => {
   const gate = gates.lessons?.find(row => row.lessonId === item.id && row.tagLabel === campusLessonTag && !row.ongoing);
   return gate ? [{item, gate}] : [];
 });
 const active = pilots.find(({item,gate}) => item.id === reading && gate.isUnlocked);
 if (active) return <section className={styles.reader} aria-label="캠퍼스 실습 수업">
   <button type="button" className="btn small" onClick={() => { if (!mayLeave || mayLeave()) setReading(''); }}>수업 목록으로</button>
   <h2>{active.item.title}</h2>
   <GuidedSession campusGuided lessonId={active.item.id} enrollmentId={enrollment}
     readOnly={snapshot.scopes.find(scope => scope.enrollmentId === enrollment)?.graduate}
     onCompleted={onCompleted} fallback={<p>수업 구성이 변경되었습니다. 수업 목록에서 다시 확인해 주세요.</p>} />
 </section>;
 if(!lesson)return <section className={styles.panel}><h2>아직 공개된 수업이 없어요</h2><p>수업이 열리면 이곳에서 이어서 공부할 수 있어요.</p></section>;
 const priority=lesson.missions.find(m=>m.status==='changes_requested'||m.status==='rejected')||lesson.missions.find(m=>m.required&&m.status==='not_started');
 const primaryMission=priority&&(lesson.completed||priority.status!=='not_started')?priority:null;
 const action=primaryMission?(primaryMission.status==='not_started'?'과제 시작하기':'보완 의견 확인하기'):lesson.completed?'수업 다시 보기':'수업 이어보기';
 return <section className={styles.panel} aria-label="지금 할 수업과 과제">
  {enabled && gates.error && <p role="alert">{gates.error} <button type="button" onClick={gates.reload}>실습 목록 다시 불러오기</button></p>}
  {pilots.length > 0 && <section className={styles.pilots} aria-label="캠퍼스 실습"><h2>캠퍼스에서 바로 실습하기</h2>
    {pilots.map(({item,gate}) => <article key={item.id}><h3>{item.title}</h3>
      {gate.isUnlocked ? <button type="button" className={styles.primary} onClick={() => setReading(item.id)}>{item.completed ? '실습 다시 보기' : '실습 열기'}</button> : <p>{gate.reason || '앞선 수업을 완료하면 열립니다.'}</p>}
    </article>)}</section>}
  <div className={styles.top}><span>한 번에 한 걸음씩</span><label>수업 선택<select value={lesson.id} onChange={e=>setChosen(e.target.value)}>{snapshot.lessons.map(l=><option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select></label></div>
  <article className={styles.next}><span className={styles.day}>{lesson.day}일차</span><h2>{lesson.title}</h2><p>{primaryMission?'과제의 안내와 검토 의견을 확인해 주세요.':lesson.completed?'필요한 부분을 다시 보거나 아래에서 과제를 확인하세요.':'공부하던 수업을 이어서 보고, 배운 내용을 과제로 적용해 보세요.'}</p><button className={styles.primary} onClick={()=>onOpen(lesson.id,primaryMission?.id)}>{action}<span aria-hidden="true"> →</span></button></article>
  <div className={styles.tasks}><h3>이 수업의 과제</h3>{!lesson.missions.length?<p>별도로 제출할 과제가 없어요.</p>:lesson.missions.map(m=><div key={m.id} className={styles.task}><div><strong>{m.title}</strong><p>{statusText[m.status]||'상태 확인이 필요해요'}</p></div>{m.id!==primaryMission?.id&&<button onClick={()=>onOpen(lesson.id,m.id)}>{m.status==='not_started'?'과제 열기':m.status==='changes_requested'||m.status==='rejected'?'검토 의견 보기':'제출 내용 보기'}</button>}</div>)}</div>
  <p className={styles.hint}>위의 닫기 버튼 또는 Esc를 누르면 원래 공간으로 돌아가요.</p>
 </section>;
}
