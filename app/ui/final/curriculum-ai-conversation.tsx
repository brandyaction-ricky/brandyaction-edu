'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { QuestionContext } from '@/lib/question-hub';
import type { AiTurn, CurriculumAnswer } from '@/lib/curriculum-ai';
import { aiHistoryUrl, type SavedAiExchange } from '@/lib/curriculum-ai-history';
import Link from 'next/link';
import { QuestionImage, QuestionImagePicker, type QuestionImagePickerHandle, type ReadyQuestionImage } from './question-image';
import { QuestionImageDropzone } from './question-image-dropzone';
import { QuestionComposer, questionRequest } from './question-composer';
import './curriculum-ai.css';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
type Turn = AiTurn & { result?:CurriculumAnswer; imageAttached?:boolean; requestId?:string; imageId?:string|null; pending?:boolean };
function savedTurns(items:SavedAiExchange[]):Turn[]{return [...items].reverse().flatMap(item=>[
 {role:'user' as const,text:item.question,requestId:item.requestId,imageId:item.imageId,imageAttached:Boolean(item.imageId)},
 {role:'assistant' as const,text:item.answer?.answer || (item.status==='pending'?'답변을 생성 중이에요. 잠시 후 대화를 새로고침해 주세요.':item.error || '답변을 확인하지 못했어요.'),result:item.answer || undefined,pending:item.status==='pending'},
]);}
export function CurriculumAiConversation({context,showContext=true,onStateChange,onCreated}:{context:QuestionContext;showContext?:boolean;onStateChange:(value:{dirty:boolean;locked:boolean})=>void;onCreated:()=>void}) {
 const imagesEnabled=process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true';
 const [image,setImage]=useState<{id:string|null;busy:boolean;draft:boolean;info?:ReadyQuestionImage}>({id:null,busy:false,draft:false}),[imageKey,setImageKey]=useState(0);
 const imagePicker=useRef<QuestionImagePickerHandle>(null);
 const [turns,setTurns]=useState<Turn[]>([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mentor,setMentor]=useState(false);
 const [loadedVersion,setLoadedVersion]=useState(-1),[historyError,setHistoryError]=useState(''),[version,setVersion]=useState(0),[more,setMore]=useState(false),[olderBusy,setOlderBusy]=useState(false);
 const loaded=loadedVersion===version;
 const [lastImage,setLastImage]=useState<ReadyQuestionImage>();
 const cursor=useRef<{time:string;id:string}|undefined>(undefined),retry=useRef<{requestId:string;question:string;imageId?:string}|null>(null);
 const [uncertain,setUncertain]=useState(false);
 useUnsavedLearningChanges(!mentor && Boolean(question || busy || image.draft));
 const gate=useRef(false),alive=useRef(true),composer=useRef({dirty:false,locked:false});
 const [mentorLocked,setMentorLocked]=useState(false);
 const updateMentor=useCallback((state:{dirty:boolean;locked:boolean})=>{composer.current=state;setMentorLocked(state.locked);onStateChange(state);},[onStateChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!mentor)onStateChange({dirty:Boolean(question || image.draft),locked:busy || image.busy || uncertain});},[question,busy,image.draft,image.busy,mentor,uncertain,onStateChange]);
 useEffect(()=>{
  const abort=new AbortController();let active=true;
  void questionRequest<{items:SavedAiExchange[];hasMore:boolean}>(aiHistoryUrl(context.enrollmentId,context.lessonId),undefined,abort.signal).then(data=>{
   if(!active)return;const items=data.items || [];setHistoryError('');const attachment=items.find(i=>i.imageId);setLastImage(attachment?{id:attachment.imageId!,name:attachment.imageName || '이전 캡처',preview:'/api/platform/question-images?ai='+attachment.requestId}:undefined);setTurns(savedTurns(items));setMore(data.hasMore);const last=items.at(-1);cursor.current=last?{time:last.createdAt,id:last.requestId}:undefined;
   const pending=retry.current&&items.find(i=>i.requestId===retry.current!.requestId);
   if(pending&&pending.status!=='pending'){if(pending.status==='succeeded'){setQuestion('');setImage({id:null,busy:false,draft:false});setImageKey(k=>k+1);setError('');}retry.current=null;setUncertain(false);}
   setLoadedVersion(version);
  }).catch(e=>{if(active){setHistoryError(e.message);setLoadedVersion(version);}});
  return()=>{active=false;abort.abort();};
 },[context.enrollmentId,context.lessonId,version]);
 async function older(){
  if(!cursor.current||olderBusy)return;setOlderBusy(true);setError('');
  try{const data=await questionRequest<{items:SavedAiExchange[];hasMore:boolean}>(aiHistoryUrl(context.enrollmentId,context.lessonId,cursor.current));if(!alive.current)return;setTurns(old=>[...savedTurns(data.items),...old]);setMore(data.hasMore);const last=data.items.at(-1);cursor.current=last?{time:last.createdAt,id:last.requestId}:undefined;}
  catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setOlderBusy(false);}
 }
 async function submit(event:FormEvent,checkRetry=false) {
  event.preventDefault();if(gate.current || !loaded || historyError || image.busy || (image.draft && !image.id) || !question.trim() || turns.some(t=>t.pending))return;
  if(uncertain&&!checkRetry){setVersion(v=>v+1);return;}
  gate.current=true;setBusy(true);setError('');
  const request=retry.current || {requestId:crypto.randomUUID(),question:question.trim(),...(image.id?{imageId:image.id}:{})};retry.current=request;
  try {
   const response=await fetch('/api/platform/curriculum-ai',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(55000),body:JSON.stringify({...request,enrollmentId:context.enrollmentId,lessonId:context.lessonId})});
   const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error || '답변을 불러오지 못했어요.'),{status:response.status});
   if(typeof data.answer!=='string' || !Array.isArray(data.sources))throw new Error('답변 형식을 확인하지 못했어요.');
   if(alive.current){if(request.imageId)setLastImage({id:request.imageId,name:image.info?.name || '이전 캡처',preview:'/api/platform/question-images?ai='+request.requestId});setTurns(old=>[...old,{role:'user',text:request.question,imageAttached:Boolean(request.imageId),requestId:request.requestId,imageId:request.imageId},{role:'assistant',text:data.answer,result:data}]);setQuestion('');setImage({id:null,busy:false,draft:false});setImageKey(k=>k+1);retry.current=null;setUncertain(false);}
  }catch(cause){if(alive.current){const e=cause as Error&{status?:number};setError(e.message);if(!e.status || e.status>=500 || e.status===409){setUncertain(true);setVersion(v=>v+1);}else retry.current=null;}}
  finally{gate.current=false;if(alive.current)setBusy(false);}
 }
 const handoff=['[AI 질문 후 멘토 확인 요청 · 최근 대화 일부]',...(question.trim()?['추가 질문: '+question.trim()]:[]),...turns.filter(t=>t.role==='user'||t.result).slice(-4).map(turn=>(turn.role==='user'?'내 질문: ':'AI 참고 답변: ')+turn.text.slice(0,1500)+(turn.result?.sources.length?'\n참고 수업: '+turn.result.sources.map(s=>s.title).join(', '):''))].join('\n\n').slice(0,10000);
 const locked=busy || uncertain;
 return <section className="curriculum-ai" aria-label="수업 AI 질문과 멘토 연결">
  <div className="curriculum-ai-switch" role="group" aria-label="답변 받을 대상"><button type="button" className={'btn'+(!mentor?' primary':'')} disabled={locked || image.busy || mentorLocked} aria-pressed={!mentor} onClick={()=>{if(mentor && composer.current.dirty && !window.confirm('수정 중인 멘토 질문을 닫고 AI 질문으로 돌아갈까요?'))return;setMentor(false);}}>AI에게 질문</button><button type="button" className={'btn'+(mentor?' primary':'')} disabled={locked || image.busy} aria-pressed={mentor} onClick={()=>setMentor(true)}>멘토에게 질문</button></div>
  {mentor && <><p>최근 질문과 AI 답변 일부를 함께 전달할 수 있어요. 내용을 확인·수정한 뒤 등록해 주세요. 기본은 비밀 질문입니다.</p><QuestionComposer initialContext={context} initialContent={turns.length || question ? handoff:''} initialPrivate initialImage={image.info || lastImage} quick onStateChange={updateMentor} onCreated={onCreated}/></>}
  <div className="curriculum-ai-body" hidden={mentor}>
   {showContext&&<p className="curriculum-ai-context"><b>질문할 수업</b><span>{context.label}</span></p>}
   <details className="curriculum-ai-guide"><summary>AI 사용·저장 안내<span>OpenAI 전달 · 비공개 저장</span></summary><div><p>공개된 문샷 수업 자료에서 근거를 찾아 안내해요. 질문·최근 대화·관련 수업 자료와 이번에 첨부한 캡처가 OpenAI에 전달됩니다. AI 답변은 틀릴 수 있어요. 개인정보는 적지 마세요.</p><p>질문·AI 답변·첨부 내역은 이 수업과 ‘내 질문’에 자동 저장돼요. 이전 사진은 다시 첨부하지 않으면 다음 질문에 보내지 않아요.</p></div></details>
   <div className="curriculum-ai-toolbar"><div><h3>이 수업의 대화</h3><p>질문과 답변은 자동으로 저장돼요.</p></div><button type="button" className="btn small" disabled={busy || image.busy || !loaded || olderBusy} onClick={()=>setVersion(v=>v+1)}>대화 새로고침</button></div>
   {more&&<button type="button" className="btn small curriculum-ai-older" disabled={busy || !loaded || olderBusy} onClick={()=>void older()}>이전 대화 더 보기</button>}
   {!loaded&&<p role="status">저장된 대화를 불러오고 있어요.</p>}{historyError&&<p role="alert">대화를 불러오지 못했어요. {historyError} 위의 ‘대화 새로고침’으로 다시 확인해 주세요.</p>}
   <div className="curriculum-ai-turns" role="log" aria-label="AI 질문 대화">{turns.map((turn,i)=><article key={turn.requestId || i} className={'curriculum-ai-turn '+turn.role}><b className="curriculum-ai-speaker">{turn.role==='user'?'내 질문':'AI 참고 답변'}</b><p>{turn.text}</p>{turn.imageAttached&&<div className="curriculum-ai-attachment"><small>화면 캡처 1장 함께 전달</small><QuestionImage questionId={turn.requestId!} aiRequestId={turn.requestId} imageId={turn.imageId}/></div>}{turn.result&&<div className="curriculum-ai-sources"><small>답변 당시 참고 범위: 이용 가능한 수업 {turn.result.searchedLessons}개</small>{turn.result.sources.map(s=><details key={s.id}><summary>{s.title} · 근거 보기</summary><p>{s.excerpt}</p><small>{s.revision?'본문 버전 '+s.revision.slice(0,8):'기존 본문'}</small><p><Link href={`/learn/${context.enrollmentId}/${s.lessonId}`} target="_blank" rel="noopener noreferrer">참고 수업 새 창으로 열기</Link></p></details>)}{turn.result.needsMentor&&<p>멘토 확인을 권해요. 위 ‘멘토에게 질문’에서 이어갈 수 있어요.</p>}</div>}</article>)}</div>
   {loaded&&!historyError&&!turns.length&&<p className="curriculum-ai-empty">수업에서 막힌 부분을 편하게 물어보세요.<br/>질문과 답변은 여기에 차곡차곡 남아요.</p>}
   <QuestionImageDropzone enabled={imagesEnabled} locked={locked || image.busy || mentorLocked} onFiles={files=>imagePicker.current?.paste(files)}><form className="curriculum-ai-composer" onSubmit={submit} onPaste={event=>{if(!imagesEnabled || locked || image.busy)return;const files=Array.from(event.clipboardData.items).filter(item=>item.kind==='file' && item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>file!==null);if(files.length){event.preventDefault();imagePicker.current?.paste(files);}}}><label className="field">궁금한 점<textarea rows={3} maxLength={2000} disabled={locked || !loaded} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="예: 이 수업의 프롬프트를 실행했는데 예시와 다른 결과가 나와요. 어떤 부분을 확인하면 될까요?"/></label>{imagesEnabled&&<><QuestionImagePicker key={imageKey} dragAndDrop ref={imagePicker} enrollmentId={context.enrollmentId} lessonId={context.lessonId} compact ai locked={locked || mentorLocked} changed={(id,uploading,draft,info)=>setImage({id,busy:uploading,draft,info})}/><small className="meta">개인정보·비밀번호를 가린 캡처만 첨부해 주세요. 이번 질문에만 전달되며, 애니메이션은 첫 화면만 확인해요.</small></>}{error&&<p role="alert" className="form-error">{error}</p>}{uncertain?<p role="status">질문을 다시 보내기 전에 ‘대화 새로고침’으로 저장 결과를 확인해 주세요. 아직 내역이 없다면 같은 요청으로 <button type="button" className="link" disabled={busy || !loaded || Boolean(historyError) || turns.some(t=>t.pending)} onClick={event=>void submit(event,true)}>답변 결과 다시 확인</button>할 수 있어요.</p>:null}<button type="submit" className="btn primary" disabled={locked || !loaded || Boolean(historyError) || turns.some(t=>t.pending) || image.busy || (image.draft && !image.id) || !question.trim()}>{busy?'수업 근거를 확인하고 있어요…':'AI 답변 받기'}</button></form></QuestionImageDropzone>
  </div>
 </section>;
}
