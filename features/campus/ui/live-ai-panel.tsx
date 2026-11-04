'use client';
import {useState} from 'react';
import type {CampusSnapshot} from '../contracts';
import {CurriculumAiConversation} from '@/app/ui/final/curriculum-ai-conversation';
import {MyAiConversations} from '@/app/ui/final/curriculum-ai-history';
import {QuestionComposer} from '@/app/ui/final/question-composer';
import {useCampusDraftGuard} from './draft-guard';
import styles from './workspace.module.css';
export function LiveAiPanel({snapshot,demo,handoff,active=true}:{active?:boolean;snapshot:CampusSnapshot;demo:boolean;handoff?:{lessonId:string;context:string}|null}){
 const [lessonId,setLessonId]=useState(handoff?.lessonId||snapshot.lessons[0]?.id||''),[mode,setMode]=useState('ai'),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false),[locked,setLocked]=useState(false);
 useCampusDraftGuard(dirty,locked,'campus-ai',active);
 const lesson=snapshot.lessons.find(l=>l.id===lessonId),context=lesson&&snapshot.selectedEnrollmentId?{enrollmentId:snapshot.selectedEnrollmentId,lessonId,label:`${lesson.day}일차 · ${lesson.title}`,recent:false}:null;
 function change(fn:()=>void){if(locked){setNotice('답변을 기다리고 있어요. 잠시 후 이동해 주세요.');return;}if(dirty&&!window.confirm('작성 중인 질문이 있습니다. 내용을 버리고 이동할까요?'))return;setDirty(false);fn();}
 return <section className={styles.ai}><h2>수업을 아는 문샷 AI 조교</h2><p>현재 공개된 수업을 찾아 근거와 함께 답변하고, 대화를 수업별로 보관합니다. 해결되지 않는 질문은 멘토에게 이어갈 수 있어요.</p>{demo&&<p className={styles.alert}>가상 검수 모드입니다. 실제 OpenAI 호출이나 실제 멘토 전달을 하지 않습니다.</p>}<div className={styles.aiTabs}>{[['ai','AI에게 질문'],['mentor','멘토에게 질문'],['history','이전 AI 대화']].map(([id,label])=><button key={id} aria-pressed={mode===id} onClick={()=>change(()=>setMode(id))}>{label}</button>)}</div>{notice&&<p role="status">{notice}</p>}{mode==='history'?<MyAiConversations/>:<><label htmlFor="campus-ai-lesson">질문할 수업</label><select id="campus-ai-lesson" value={lessonId} onChange={e=>change(()=>setLessonId(e.target.value))}>{snapshot.lessons.map(l=><option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select>{context?mode==='ai'?<CurriculumAiConversation key={'ai'+lessonId} context={context} initialQuestion={handoff?.lessonId===lessonId?handoff.context:undefined} onStateChange={s=>{setDirty(s.dirty);setLocked(s.locked);}} onCreated={()=>setNotice('질문 기록을 저장했습니다.')}/>:<QuestionComposer key={'mentor'+lessonId} initialContext={context} initialPrivate onStateChange={s=>{setDirty(s.dirty);setLocked(s.locked);}} onCreated={()=>setNotice('멘토 질문을 등록했습니다.')}/>:<p>현재 이용 가능한 수업을 선택해 주세요.</p>}</>}</section>;
}
