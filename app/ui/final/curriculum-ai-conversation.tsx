'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { QuestionContext } from '@/lib/question-hub';
import type { AiTurn, CurriculumAnswer } from '@/lib/curriculum-ai';
import { aiHistoryUrl, type SavedAiExchange } from '@/lib/curriculum-ai-history';
import { hasSensitiveQuestionText, sensitiveQuestionMessage } from '@/lib/curriculum-ai-sensitive';
import Link from 'next/link';
import { QuestionImage, QuestionImagePicker, type QuestionImagePickerHandle, type ReadyQuestionImage } from './question-image';
import { QuestionImageDropzone } from './question-image-dropzone';
import { QuestionComposer, questionRequest } from './question-composer';
import './curriculum-ai.css';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
type Turn = AiTurn & { result?:CurriculumAnswer; imageAttached?:boolean; requestId?:string; imageId?:string|null; pending?:boolean; helpful?:boolean; createdAt?:string };
const questionLimit=2000;
const messageTime=new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Seoul'});
function readableAnswer(text:string){
 return text.replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/`([^`\n]+)`/g,'$1');
}
function savedTurns(items:SavedAiExchange[]):Turn[]{return [...items].reverse().flatMap(item=>[
 {role:'user' as const,text:item.question,requestId:item.requestId,createdAt:item.createdAt,imageId:item.imageId,imageAttached:Boolean(item.imageId)},
 {role:'assistant' as const,requestId:item.requestId,createdAt:item.createdAt,helpful:item.helpful,text:item.answer?.answer || (item.status==='pending'?'답변을 생성 중이에요. 잠시 후 대화를 새로고침해 주세요.':item.error || '답변을 확인하지 못했어요.'),result:item.answer || undefined,pending:item.status==='pending'},
]);}
export function CurriculumAiConversation({context,showContext=true,compact=false,onLessonPage=false,onStateChange,onCreated}:{context:QuestionContext;showContext?:boolean;compact?:boolean;onLessonPage?:boolean;onStateChange:(value:{dirty:boolean;locked:boolean})=>void;onCreated:()=>void}) {
 const imagesEnabled=process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true';
 const [image,setImage]=useState<{id:string|null;busy:boolean;draft:boolean;info?:ReadyQuestionImage}>({id:null,busy:false,draft:false}),[imageKey,setImageKey]=useState(0);
 const imagePicker=useRef<QuestionImagePickerHandle>(null);
 const [turns,setTurns]=useState<Turn[]>([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mentor,setMentor]=useState(false);
 const input=useRef<HTMLTextAreaElement>(null);
 const draftKey='edu-ai-draft:'+context.enrollmentId+':'+context.lessonId;
 const requestKey=draftKey+':request';
 const [draftReady,setDraftReady]=useState(false);
 const [canResume,setCanResume]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');
 const [historyAction,setHistoryAction]=useState(false);
 const [historyNotice,setHistoryNotice]=useState('');
 const [expandedHistory,setExpandedHistory]=useState(false);
 const [mentorDraft,setMentorDraft]=useState('');
 const cursor=useRef<{time:string;id:string}|undefined>(undefined),retry=useRef<{requestId:string;question:string;imageId?:string}|null>(null);
 const [uncertain,setUncertain]=useState(false);
 const clearRetry=useCallback(()=>{
  retry.current=null;
  setCanResume(false);
  try{sessionStorage.removeItem(requestKey);}catch{/* Storage may be disabled. */}
 },[requestKey]);
 const sensitive=hasSensitiveQuestionText(question);
 useEffect(()=>{
  const restore=window.setTimeout(()=>{
   try{
    const saved=sessionStorage.getItem(requestKey);
    if(saved){
     const request=JSON.parse(saved) as NonNullable<typeof retry.current>;
     retry.current=request;
     setQuestion(request.question);
     setUncertain(true);
     setCanResume(true);
    }else setQuestion(sessionStorage.getItem(draftKey) || '');
   }catch{/* Storage may be disabled. */}
   setDraftReady(true);
  },0);
  return()=>window.clearTimeout(restore);
 },[draftKey,requestKey]);
 const updateQuestion=useCallback((value:string)=>{
  setQuestion(value);
  try{
   if(value && !hasSensitiveQuestionText(value))sessionStorage.setItem(draftKey,value);
   else sessionStorage.removeItem(draftKey);
  }catch{/* Keep the in-memory draft available. */}
 },[draftKey]);
 const [loadedVersion,setLoadedVersion]=useState(-1),[historyError,setHistoryError]=useState(''),[version,setVersion]=useState(0),[more,setMore]=useState(false),[olderBusy,setOlderBusy]=useState(false);
 const loaded=loadedVersion===version && draftReady;
 useUnsavedLearningChanges(!mentor && Boolean(busy || image.draft));
 const gate=useRef(false),alive=useRef(true),composer=useRef({dirty:false,locked:false});
 const [mentorLocked,setMentorLocked]=useState(false);
 const updateMentor=useCallback((state:{dirty:boolean;locked:boolean})=>{composer.current=state;setMentorLocked(state.locked);onStateChange(state);},[onStateChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!mentor)onStateChange({dirty:image.draft && !canResume,locked:image.busy || ((busy || uncertain) && !canResume)});},[busy,image.draft,image.busy,mentor,uncertain,canResume,onStateChange]);
 useEffect(()=>{
  if(!draftReady)return;
  const abort=new AbortController();let active=true;
  void questionRequest<{items:SavedAiExchange[];hasMore:boolean}>(aiHistoryUrl(context.enrollmentId,context.lessonId),undefined,abort.signal).then(data=>{
   if(!active)return;const items=data.items || [];setHistoryError('');setTurns(savedTurns(items));setMore(data.hasMore);const last=items.at(-1);cursor.current=last?{time:last.createdAt,id:last.requestId}:undefined;
   const pending=retry.current&&items.find(i=>i.requestId===retry.current!.requestId);
   if(pending&&pending.status!=='pending'){if(pending.status==='succeeded'){updateQuestion('');setImage({id:null,busy:false,draft:false});setImageKey(k=>k+1);setError('');}clearRetry();setUncertain(false);}
   setLoadedVersion(version);
  }).catch(()=>{if(active){setHistoryError('인터넷 연결을 확인해 주세요.');setLoadedVersion(version);}});
  return()=>{active=false;abort.abort();};
 },[context.enrollmentId,context.lessonId,version,updateQuestion,draftReady,clearRetry]);
 const pendingAnswer=turns.some(turn=>turn.pending);
 useEffect(()=>{
  if(!loaded || !pendingAnswer || busy)return;
  const timer=window.setTimeout(()=>setVersion(value=>value+1),2500);
  return()=>window.clearTimeout(timer);
 },[loaded,pendingAnswer,busy]);
 async function older(){
  if(!cursor.current||olderBusy)return;setOlderBusy(true);setError('');
  try{const data=await questionRequest<{items:SavedAiExchange[];hasMore:boolean}>(aiHistoryUrl(context.enrollmentId,context.lessonId,cursor.current));if(!alive.current)return;setTurns(old=>[...savedTurns(data.items),...old]);setMore(data.hasMore);const last=data.items.at(-1);cursor.current=last?{time:last.createdAt,id:last.requestId}:undefined;}
  catch{if(alive.current)setError('이전 대화를 불러오지 못했어요. 다시 시도해 주세요.');}finally{if(alive.current)setOlderBusy(false);}
 }
 async function submit(event:FormEvent,checkRetry=false) {
  event.preventDefault();if(gate.current || historyAction || !loaded || historyError || image.busy || (image.draft && !image.id) || !question.trim() || sensitive || (!checkRetry && turns.some(t=>t.pending)))return;
  if(uncertain&&!checkRetry){setVersion(v=>v+1);return;}
  gate.current=true;setBusy(true);setError('');
  const request=retry.current || {requestId:crypto.randomUUID(),question:question.trim(),...(image.id?{imageId:image.id}:{})};retry.current=request;
  try{sessionStorage.setItem(requestKey,JSON.stringify(request));setCanResume(true);}catch{/* Keep the dialog locked without a resumable request. */}
  try {
   const response=await fetch('/api/platform/curriculum-ai',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(55000),body:JSON.stringify({...request,enrollmentId:context.enrollmentId,lessonId:context.lessonId})});
   const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error || '답변을 불러오지 못했어요.'),{status:response.status});
   if(typeof data.answer!=='string' || !Array.isArray(data.sources))throw new Error('답변 형식을 확인하지 못했어요.');
   if(alive.current){const createdAt=new Date().toISOString();setTurns(old=>[...old,{role:'user',createdAt,text:request.question,imageAttached:Boolean(request.imageId),requestId:request.requestId,imageId:request.imageId},{role:'assistant',requestId:request.requestId,createdAt,text:data.answer,result:data}]);updateQuestion('');setImage({id:null,busy:false,draft:false});setImageKey(k=>k+1);clearRetry();setUncertain(false);}
  }catch(cause){if(alive.current){const e=cause as Error&{status?:number};setError(!e.status?'인터넷 연결을 확인해 주세요. 보낸 질문이 저장됐는지 확인하고 있어요.':e.status>=500?'답변을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.':e.message);if(!e.status || e.status>=500 || e.status===409){setUncertain(true);setVersion(v=>v+1);}else {clearRetry();setUncertain(false);}}}
  finally{gate.current=false;if(alive.current)setBusy(false);}
 }
 async function manageTurn(turn:Turn,action:'feedback'|'delete'){
  if(!turn.requestId || historyAction || busy || uncertain || olderBusy || !loaded)return;
  if(action==='delete'&&!window.confirm('이 질문과 답변을 내 AI 대화에서 삭제할까요? 이후 AI 답변에도 이 대화가 사용되지 않아요.'))return;
  setHistoryAction(true);
  setHistoryNotice('');
  try{
   const response=await fetch('/api/platform/curriculum-ai/history',{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({requestId:turn.requestId,action,helpful:!turn.helpful}),
   });
   if(!response.ok)throw new Error('AI history action failed');
   setTurns(previous=>action==='delete'
    ?previous.filter(item=>item.requestId!==turn.requestId)
    :previous.map(item=>item.role==='assistant'&&item.requestId===turn.requestId?{...item,helpful:!turn.helpful}:item));
   setHistoryNotice(action==='delete'?'질문과 답변을 삭제했어요.':'답변 평가를 저장했어요.');
  }catch{setHistoryNotice('변경 결과를 확인하지 못했어요. 대화 새로고침 후 다시 시도해 주세요.');}
  finally{setHistoryAction(false);}
 }
 function continueWithMentor(turn:Turn){
  const original=turns.find(item=>item.role==='user' && item.requestId===turn.requestId);
  const draft=[original?.text && '내 질문\n'+original.text, 'AI 참고 답변\n'+readableAnswer(turn.text), '멘토에게 확인하고 싶은 점\n'].filter(Boolean).join('\n\n');
  setMentorDraft(draft.slice(0,10000));
  setMentor(true);
 }
 const locked=busy || uncertain || historyAction;
 useEffect(()=>{
  if(!loaded || locked || mentor)return;
  const field=input.current;
  const active=document.activeElement;
  const dialog=field?.closest('dialog,[role=dialog]');
  if(dialog && (active===document.body || (active instanceof HTMLButtonElement && active.getAttribute('aria-label')==='닫기' && dialog.contains(active))))field?.focus({preventScroll:true});
 },[loaded,locked,mentor]);

 const usageGuide=<details className="curriculum-ai-guide"><summary>AI 사용·저장 안내<span>OpenAI 전달 · 비공개 저장</span></summary><div><p>공개된 문샷 수업 자료에서 근거를 찾아 안내해요. 질문·최근 대화·관련 수업 자료와 이번에 첨부한 캡처가 OpenAI에 전달됩니다. AI 답변은 틀릴 수 있어요. 개인정보는 적지 마세요.</p><p>질문·AI 답변·첨부 내역은 이 수업과 ‘내 질문’에 자동 저장돼요. 이전 사진은 다시 첨부하지 않으면 다음 질문에 보내지 않아요.</p>{compact && imagesEnabled && <p>이미지 한 장(최대 10MB)을 붙여넣거나 질문 입력란에 끌어 놓을 수 있어요. 개인정보·비밀번호는 가려 주세요. 움직이는 이미지는 첫 화면만 확인해요.</p>}</div></details>;
 return <section className="curriculum-ai" aria-label="수업 AI 질문과 멘토 연결">
  <div className="curriculum-ai-switch" role="group" aria-label="답변 받을 대상"><button type="button" className={'btn'+(!mentor?' primary':'')} disabled={locked || image.busy || mentorLocked} aria-pressed={!mentor} onClick={()=>{if(mentor && composer.current.dirty && !window.confirm('수정 중인 멘토 질문을 닫고 AI 질문으로 돌아갈까요?'))return;setMentorDraft('');setMentor(false);}}>AI에게 질문</button><button type="button" className={'btn'+(mentor?' primary':'')} disabled={locked || image.busy} aria-pressed={mentor} onClick={()=>setMentor(true)}>멘토에게 질문</button></div>
  {mentor && <><p>멘토에게 전달할 내용과 캡처를 직접 선택해 주세요. 기본은 비밀 질문입니다.</p><QuestionComposer initialContext={context} initialContent={mentorDraft} initialPrivate quick onStateChange={updateMentor} onCreated={onCreated}/></>}
  <div className="curriculum-ai-body" hidden={mentor}>
   {showContext&&<p className="curriculum-ai-context"><b>질문할 수업</b><span>{context.label}</span></p>}
   {!compact&&usageGuide}
   <QuestionImageDropzone enabled={imagesEnabled} locked={locked || image.busy || mentorLocked} onFiles={files=>imagePicker.current?.paste(files)}><form className="curriculum-ai-composer" onSubmit={submit} onPaste={event=>{if(!imagesEnabled || locked || image.busy)return;const files=Array.from(event.clipboardData.items).filter(item=>item.kind==='file' && item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>file!==null);if(files.length){event.preventDefault();imagePicker.current?.paste(files);}}}><p className="meta curriculum-ai-privacy">{compact?'OpenAI에 전송돼요. 개인정보는 가려 주세요.':'비밀번호·카드번호 등 개인정보는 질문에 적지 마세요.'}</p><label className="field">궁금한 점<textarea ref={input} rows={compact?2:3} maxLength={questionLimit} disabled={locked || !loaded} value={question} onChange={e=>updateQuestion(e.target.value)} placeholder="예: 이 수업의 프롬프트를 실행했는데 예시와 다른 결과가 나와요. 어떤 부분을 확인하면 될까요?"/></label>{question.length>=1800&&<small className="meta">{questionLimit-question.length}자 남았어요</small>}{imagesEnabled&&<><QuestionImagePicker key={imageKey} dragAndDrop ref={imagePicker} enrollmentId={context.enrollmentId} lessonId={context.lessonId} compact ai showHint={!compact} locked={locked || mentorLocked} changed={(id,uploading,draft,info)=>setImage({id,busy:uploading,draft,info})}/>{!compact && <small className="meta curriculum-ai-image-privacy">개인정보·비밀번호를 가린 캡처만 첨부해 주세요. 이번 질문에만 전달되며, 애니메이션은 첫 화면만 확인해요.</small>}</>}{image.id&&!question.trim()&&<p className="meta">캡처에서 궁금한 점을 한 줄만 적어 주세요.</p>}{sensitive&&<p role="alert" className="form-error">{sensitiveQuestionMessage}</p>}{error&&<p role="alert" className="form-error">{error}</p>}{uncertain?<p role="status">질문을 다시 보내기 전에 ‘대화 새로고침’으로 저장 결과를 확인해 주세요. 아직 내역이 없다면 같은 요청으로 <button type="button" className="link" disabled={busy || !loaded || Boolean(historyError) || turns.some(t=>t.pending)} onClick={event=>void submit(event,true)}>답변 결과 다시 확인</button>할 수 있어요.</p>:null}<button type="submit" className="btn primary" disabled={locked || !loaded || Boolean(historyError) || turns.some(t=>t.pending) || image.busy || (image.draft && !image.id) || !question.trim() || sensitive}>{busy?'수업 근거를 확인하고 있어요…':'AI 답변 받기'}</button></form></QuestionImageDropzone>
   {compact&&usageGuide}
   <div className="curriculum-ai-toolbar"><div><h3>이 수업의 대화</h3><p>질문과 답변은 자동으로 저장돼요.</p></div><button type="button" className="btn small" disabled={busy || historyAction || image.busy || !loaded || olderBusy} onClick={()=>setVersion(v=>v+1)}>대화 새로고침</button></div>
   {compact&&turns.length>2&&<button type="button" className="btn small" aria-expanded={expandedHistory} onClick={()=>setExpandedHistory(value=>!value)}>{expandedHistory?'이전 대화 접기':'이전 대화 보기'}</button>}
   {more&&(!compact||expandedHistory)&&<button type="button" className="btn small curriculum-ai-older" disabled={busy || historyAction || !loaded || olderBusy} onClick={()=>void older()}>이전 대화 더 보기</button>}
   {!loaded&&<p role="status">저장된 대화를 불러오고 있어요.</p>}{historyError&&<p role="alert">대화를 불러오지 못했어요. {historyError} 위의 ‘대화 새로고침’으로 다시 확인해 주세요.</p>}
   <div className="curriculum-ai-turns" role="log" aria-label="AI 질문 대화" aria-live="polite">{(compact&&!expandedHistory?turns.slice(-2):turns).map((turn,i)=><article key={turn.requestId?turn.role+':'+turn.requestId:i} className={'curriculum-ai-turn '+turn.role}><b className="curriculum-ai-speaker">{turn.role==='user'?'내 질문':'AI 참고 답변'}</b>{turn.createdAt&&<time className="meta" dateTime={turn.createdAt}>{messageTime.format(new Date(turn.createdAt))}</time>}{turn.result?.captureLesson&&<p>첨부한 화면은 지금 보고 있는 수업과 달라요. <Link href={`/learn/${context.enrollmentId}/${turn.result.captureLesson.lessonId}`}>{turn.result.captureLesson.dayNumber===undefined?'':turn.result.captureLesson.dayNumber+'일차 · '}{turn.result.captureLesson.title}</Link></p>}<p>{turn.role==='assistant'?readableAnswer(turn.text):turn.text}</p>{turn.imageAttached&&<div className="curriculum-ai-attachment"><small>화면 캡처 1장 함께 전달</small><QuestionImage questionId={turn.requestId!} aiRequestId={turn.requestId} imageId={turn.imageId}/></div>}{turn.result&&<div className="curriculum-ai-sources">{turn.result.sources.length>0&&<small>이 답변에 인용한 근거 {turn.result.sources.length}개</small>}{turn.result.sources.map(s=><details key={s.id}><summary>{s.title} · 근거 보기</summary><p>{s.excerpt}</p><small>{s.revision?'본문 버전 '+s.revision.slice(0,8):'기존 본문'}</small><p><Link href={`/learn/${context.enrollmentId}/${s.lessonId}${s.blockId ? '#lesson-block-' + encodeURIComponent(s.blockId) : ''}`} target={onLessonPage && s.blockId && s.lessonId===context.lessonId?undefined:'_blank'} rel="noopener noreferrer">{onLessonPage && s.blockId && s.lessonId===context.lessonId?'이 수업의 근거 위치로 이동':'참고 수업 새 창으로 열기'}</Link></p></details>)}<div className="row"><button type="button" className="btn small" aria-pressed={Boolean(turn.helpful)} disabled={locked || olderBusy || !loaded} onClick={()=>void manageTurn(turn,'feedback')}>도움이 됐어요</button><button type="button" className="btn small" onClick={async()=>{try{await navigator.clipboard.writeText(readableAnswer(turn.text));setCopyStatus('답변을 복사했어요.');}catch{setCopyStatus('복사하지 못했어요. 답변을 선택해 직접 복사해 주세요.');}}}>답변 복사</button><button type="button" className="btn small" disabled={locked || image.busy} onClick={()=>setMentor(true)}>잘못된 답변 · 멘토에게 확인</button><button type="button" className="btn small" disabled={locked || image.busy} onClick={()=>continueWithMentor(turn)}>멘토에게 이어서 질문</button></div>{turn.result.needsMentor&&<p>멘토 확인을 권해요. ‘멘토에게 질문’에서 이어갈 수 있어요.</p>}</div>}{turn.role==='assistant'&&turn.requestId&&!turn.pending&&<button type="button" className="btn small" disabled={locked || olderBusy || !loaded} onClick={()=>void manageTurn(turn,'delete')}>이 질문과 답변 삭제</button>}</article>)}</div>
   <div role="status">{copyStatus}</div><div role="status">{historyNotice}</div>
   {busy&&<><article className="curriculum-ai-turn user"><b className="curriculum-ai-speaker">내 질문</b><p>{question.trim()}</p></article><p role="status">답변을 준비하고 있어요.</p></>}
   {loaded&&!busy&&!historyError&&!turns.length&&<p className="curriculum-ai-empty">수업에서 막힌 부분을 편하게 물어보세요.<br/>질문과 답변은 여기에 차곡차곡 남아요.</p>}

  </div>
 </section>;
}
