'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { QuestionContext } from '@/lib/question-hub';
import type { AiTurn, CurriculumAnswer } from '@/lib/curriculum-ai';
import Link from 'next/link';
import { QuestionComposer } from './question-composer';
import './curriculum-ai.css';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
type Turn = AiTurn & { result?:CurriculumAnswer };
export function CurriculumAiConversation({context,onStateChange,onCreated}:{context:QuestionContext;onStateChange:(value:{dirty:boolean;locked:boolean})=>void;onCreated:()=>void}) {
 const [turns,setTurns]=useState<Turn[]>([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mentor,setMentor]=useState(false);
 useUnsavedLearningChanges(!mentor && Boolean(question || turns.length || busy));
 const gate=useRef(false),alive=useRef(true),composer=useRef({dirty:false,locked:false});
 const [mentorLocked,setMentorLocked]=useState(false);
 const updateMentor=useCallback((state:{dirty:boolean;locked:boolean})=>{composer.current=state;setMentorLocked(state.locked);onStateChange(state);},[onStateChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!mentor)onStateChange({dirty:Boolean(question || turns.length),locked:busy});},[question,turns,busy,mentor,onStateChange]);
 async function submit(event:FormEvent) {
  event.preventDefault();if(gate.current || !question.trim())return;
  gate.current=true;setBusy(true);setError('');
  const text=question.trim();
  try {
   const response=await fetch('/api/platform/curriculum-ai',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(55000),body:JSON.stringify({requestId:crypto.randomUUID(),enrollmentId:context.enrollmentId,lessonId:context.lessonId,question:text,
    history:turns.slice(-4).map(t=>({role:t.role,text:t.text.slice(0,1500)}))})});
   const data=await response.json();if(!response.ok)throw new Error(data.error || '답변을 불러오지 못했어요.');
   if(typeof data.answer!=='string' || !Array.isArray(data.sources))throw new Error('답변 형식을 확인하지 못했어요.');
   if(alive.current){setTurns(old=>[...old.slice(-6),{role:'user',text},{role:'assistant',text:data.answer,result:data}]);setQuestion('');}
  }catch(cause){if(alive.current)setError((cause as Error).message);}
  finally{gate.current=false;if(alive.current)setBusy(false);}
 }
 const handoff=['[AI 질문 후 멘토 확인 요청 · 최근 대화 일부]',...(question.trim()?['추가 질문: '+question.trim()]:[]),...turns.slice(-4).map(turn=>(turn.role==='user'?'내 질문: ':'AI 참고 답변: ')+turn.text.slice(0,1500)+(turn.result?.sources.length?'\n참고 수업: '+turn.result.sources.map(s=>s.title).join(', '):''))].join('\n\n').slice(0,10000);
 return <section className="curriculum-ai" aria-label="수업 AI 질문과 멘토 연결">
  <div className="row"><button type="button" className={'btn'+(!mentor?' primary':'')} disabled={busy || mentorLocked} aria-pressed={!mentor} onClick={()=>{if(mentor && composer.current.dirty && !window.confirm('수정 중인 멘토 질문을 닫고 AI 질문으로 돌아갈까요?'))return;setMentor(false);}}>AI에게 질문</button><button type="button" className={'btn'+(mentor?' primary':'')} disabled={busy} aria-pressed={mentor} onClick={()=>setMentor(true)}>멘토에게 질문</button></div>
  {mentor ? <><p>최근 질문과 AI 답변 일부를 함께 전달할 수 있어요. 내용을 확인·수정한 뒤 등록해 주세요. 기본은 비밀 질문입니다.</p><QuestionComposer initialContext={context} initialContent={turns.length || question ? handoff:''} initialPrivate quick onStateChange={updateMentor} onCreated={onCreated}/></> : <>
   <p className="meta">공개된 문샷 수업 자료에서 근거를 찾아 안내해요. 입력한 질문·최근 대화·관련 수업 자료가 OpenAI에 전달됩니다. AI 답변은 틀릴 수 있어요. 개인정보는 적지 마세요. 대화는 이 창을 닫으면 사라집니다.</p>
   <div className="curriculum-ai-turns" role="log" aria-label="AI 질문 대화">{turns.map((turn,i)=><article key={i} className={'curriculum-ai-turn '+turn.role}><b>{turn.role==='user'?'내 질문':'AI 참고 답변'}</b><p>{turn.text}</p>{turn.result&&<><small>참고 범위: 이용 가능한 수업 {turn.result.searchedLessons}개</small>{turn.result.sources.map(s=><details key={s.id}><summary>{s.title} · 근거 보기</summary><p>{s.excerpt}</p><small>{s.revision?'본문 버전 '+s.revision.slice(0,8):'기존 본문'}</small><p><Link href={`/learn/${context.enrollmentId}/${s.lessonId}`} target="_blank" rel="noopener noreferrer">참고 수업 새 창으로 열기</Link></p></details>)}{turn.result.needsMentor&&<p>멘토 확인을 권해요. 위 ‘멘토에게 질문’에서 이어갈 수 있어요.</p>}</>}</article>)}</div>
   <form onSubmit={submit}><label className="field">궁금한 점<textarea rows={3} maxLength={2000} disabled={busy} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="지금 수업에서 어느 부분이 궁금한가요?"/></label>{error&&<p role="alert" className="form-error">{error}</p>}<button type="submit" className="btn primary" disabled={busy || !question.trim()}>{busy?'수업 근거를 확인하고 있어요…':'AI 답변 받기'}</button></form>
  </>}
 </section>;
}
