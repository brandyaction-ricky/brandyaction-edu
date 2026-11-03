'use client';
import {useState} from 'react';
import type {CampusSnapshot} from '../contracts';
import {learnerMetrics} from '../learner-metrics';
import styles from './lesson-task-panel.module.css';
const statusText:Record<string,string>={not_started:'아직 제출하지 않았어요',submitted:'답변을 기다리고 있어요',approved:'완료했어요',changes_requested:'보완할 내용이 있어요',rejected:'다시 확인해 주세요',unknown:'상태 확인이 필요해요'};
/** One lesson and its next action. The full progress dashboard lives outside the room. */
export function LessonTaskPanel({snapshot,onOpen}:{snapshot:CampusSnapshot;onOpen:(lesson:string,mission?:string)=>void}){
 const metrics=learnerMetrics(snapshot),recommended=metrics.nextActions[0];
 const [chosen,setChosen]=useState(recommended?.lessonId||snapshot.lessons[0]?.id||'');
 const lesson=snapshot.lessons.find(l=>l.id===chosen)||snapshot.lessons[0];
 if(!lesson)return <section className={styles.panel}><h2>아직 공개된 수업이 없어요</h2><p>수업이 열리면 이곳에서 이어서 공부할 수 있어요.</p></section>;
 const priority=lesson.missions.find(m=>m.status==='changes_requested'||m.status==='rejected')||lesson.missions.find(m=>m.required&&m.status==='not_started');
 const primaryMission=priority&&(lesson.completed||priority.status!=='not_started')?priority:null;
 const action=primaryMission?(primaryMission.status==='not_started'?'과제 시작하기':'보완 의견 확인하기'):lesson.completed?'수업 다시 보기':'수업 이어보기';
 return <section className={styles.panel} aria-label="지금 할 수업과 과제">
  <div className={styles.top}><span>한 번에 한 걸음씩</span><label>수업 선택<select value={lesson.id} onChange={e=>setChosen(e.target.value)}>{snapshot.lessons.map(l=><option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select></label></div>
  <article className={styles.next}><span className={styles.day}>{lesson.day}일차</span><h2>{lesson.title}</h2><p>{primaryMission?'과제의 안내와 검토 의견을 확인해 주세요.':lesson.completed?'필요한 부분을 다시 보거나 아래에서 과제를 확인하세요.':'공부하던 수업을 이어서 보고, 배운 내용을 과제로 적용해 보세요.'}</p><button className={styles.primary} onClick={()=>onOpen(lesson.id,primaryMission?.id)}>{action}<span aria-hidden="true"> →</span></button></article>
  <div className={styles.tasks}><h3>이 수업의 과제</h3>{!lesson.missions.length?<p>별도로 제출할 과제가 없어요.</p>:lesson.missions.map(m=><div key={m.id} className={styles.task}><div><strong>{m.title}</strong><p>{statusText[m.status]||'상태 확인이 필요해요'}</p></div>{m.id!==primaryMission?.id&&<button onClick={()=>onOpen(lesson.id,m.id)}>{m.status==='not_started'?'과제 열기':m.status==='changes_requested'||m.status==='rejected'?'검토 의견 보기':'제출 내용 보기'}</button>}</div>)}</div>
  <p className={styles.hint}>위의 닫기 버튼 또는 Esc를 누르면 원래 공간으로 돌아가요.</p>
 </section>;
}
