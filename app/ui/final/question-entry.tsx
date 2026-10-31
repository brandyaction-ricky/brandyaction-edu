'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuestionContext } from '@/lib/question-hub';
import { CurriculumAiConversation } from './curriculum-ai-conversation';
import { QuestionComposer, questionRequest } from './question-composer';

export function QuestionEntry({order,onCreated}:{order?:string|null;onCreated:()=>void}) {
 const enabled=process.env.NEXT_PUBLIC_EDU_CURRICULUM_AI_ENABLED === 'true' && !order;
 const [contexts,setContexts]=useState<QuestionContext[]>([]),[chosen,setChosen]=useState(''),[general,setGeneral]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0),[ready,setReady]=useState(false);
 const state=useRef({dirty:false,locked:false});
 const update=useCallback((next:{dirty:boolean;locked:boolean})=>{state.current=next;},[]);
 useEffect(()=>{if(!enabled)return;const abort=new AbortController();void questionRequest<{contexts:QuestionContext[]}>('/api/platform/question-hub?mode=contexts',undefined,abort.signal).then(data=>{setContexts(data.contexts);setReady(true);setError('');}).catch(()=>{if(!abort.signal.aborted){setError('수업 목록을 불러오지 못했어요. 다시 불러오거나 일반 문의를 남겨 주세요.');setReady(true);}});return()=>abort.abort();},[enabled,version]);
 if(!enabled)return <QuestionComposer order={order} onCreated={onCreated}/>;
 const context=contexts.find(c=>c.enrollmentId+':'+c.lessonId===chosen);
 function change(action:()=>void) {if(state.current.locked)return;if(state.current.dirty&&!window.confirm('수업이나 문의 종류를 바꾸면 아직 보내지 않은 질문·첨부가 사라집니다. 저장된 AI 대화는 남아 있어요. 바꿀까요?'))return;state.current={dirty:false,locked:false};action();}
 return <section className="question-entry" aria-label="질문할 수업 선택">
  <div className="row"><button type="button" className={'btn'+(!general?' primary':'')} aria-pressed={!general} onClick={()=>{if(general)change(()=>setGeneral(false));}}>수업 질문</button><button type="button" className={'btn'+(general?' primary':'')} aria-pressed={general} onClick={()=>{if(!general)change(()=>setGeneral(true));}}>일반·결제·계정 문의</button></div>
  {general?<QuestionComposer initialCategory="general" onStateChange={update} onCreated={onCreated}/>:<>
   <label className="field">수업·일차 선택<select aria-label="질문할 수업·일차" value={chosen} onChange={event=>change(()=>setChosen(event.target.value))}><option value="">질문할 커리큘럼을 선택해 주세요</option>{contexts.map(c=><option key={c.enrollmentId+':'+c.lessonId} value={c.enrollmentId+':'+c.lessonId}>{c.label}</option>)}</select></label>
   {error&&<p role="alert">{error} <button type="button" className="link" onClick={()=>setVersion(v=>v+1)}>목록 다시 불러오기</button></p>}
   {!ready&&<p role="status">이용 가능한 수업을 불러오고 있어요.</p>}
   {context?<CurriculumAiConversation key={chosen} context={context} showContext={false} onStateChange={update} onCreated={()=>{state.current={dirty:false,locked:false};setChosen('');onCreated();}}/>:ready&&!error&&<p className="meta">{contexts.length?'몇 일차 수업인지 선택하면 AI나 멘토에게 바로 질문할 수 있어요.':'현재 질문할 수 있는 수업이 없어요. 일반 문의는 위에서 남길 수 있어요.'}</p>}
  </>}
 </section>;
}
