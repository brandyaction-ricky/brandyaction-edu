'use client';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import type { QuestionContext } from '@/lib/question-hub';
import type { AiTurn, CurriculumAnswer } from '@/lib/curriculum-ai';
import { aiDraftKey } from '@/lib/curriculum-ai-draft';
import { aiHistoryUrl, type SavedAiExchange } from '@/lib/curriculum-ai-history';
import { hasSensitiveQuestionText, sensitiveQuestionMessage } from '@/lib/curriculum-ai-sensitive';
import Link from 'next/link';
import { Copy, MessageCircle, MoreHorizontal } from 'lucide-react';
import { QuestionImage, QuestionImagePicker, type QuestionImagePickerHandle, type ReadyQuestionImage } from './question-image';
import { QuestionImageDropzone } from './question-image-dropzone';
import { QuestionComposer, questionRequest } from './question-composer';
import './curriculum-ai.css';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
type Turn = AiTurn & { result?:CurriculumAnswer; imageAttached?:boolean; requestId?:string; imageId?:string|null; imageName?:string|null; pending?:boolean; helpful?:boolean; incorrect?:boolean; createdAt?:string };
const questionLimit=2000;
const messageTime=new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Asia/Seoul'});
function readableAnswer(text:string){
 return text.replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/`([^`\n]+)`/g,'$1');
}
function savedTurns(items:SavedAiExchange[]):Turn[]{return [...items].reverse().flatMap(item=>[
 {role:'user' as const,text:item.question,requestId:item.requestId,createdAt:item.createdAt,imageId:item.imageId,imageName:item.imageName,imageAttached:Boolean(item.imageId)},
 {role:'assistant' as const,requestId:item.requestId,createdAt:item.createdAt,helpful:item.helpful,incorrect:item.incorrect,text:item.answer?.answer || (item.status==='pending'?'답변을 생성 중이에요. 잠시 후 대화를 새로고침해 주세요.':item.error || '답변을 확인하지 못했어요.'),result:item.answer || undefined,pending:item.status==='pending'},
]);}
export function CurriculumAiConversation({context,showContext=true,compact=false,onLessonPage=false,initialQuestion='',onStateChange,onCreated,onAnswerReady}:{context:QuestionContext;showContext?:boolean;compact?:boolean;onLessonPage?:boolean;initialQuestion?:string;onStateChange:(value:{dirty:boolean;locked:boolean})=>void;onCreated:()=>void;onAnswerReady?:()=>void}) {
 const imagesEnabled=process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED === 'true';
 const [image,setImage]=useState<{id:string|null;busy:boolean;draft:boolean;info?:ReadyQuestionImage}>({id:null,busy:false,draft:false}),[imageKey,setImageKey]=useState(0);
 const imagePicker=useRef<QuestionImagePickerHandle>(null);
 const [turns,setTurns]=useState<Turn[]>([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[mentor,setMentor]=useState(false);
 const input=useRef<HTMLTextAreaElement>(null);
 const draftKey=aiDraftKey(context);
 const draftText=useRef('');
 const requestKey=draftKey+':request';
 const [draftReady,setDraftReady]=useState(false);
 const [canResume,setCanResume]=useState(false);
 const [copyStatus,setCopyStatus]=useState('');
 const [historyAction,setHistoryAction]=useState(false);
 const [historyNotice,setHistoryNotice]=useState<{message:string;needsRefresh?:boolean}>();
 const [expandedHistory,setExpandedHistory]=useState(false);
 const [mentorDraft,setMentorDraft]=useState('');
 const [mentorCapture,setMentorCapture]=useState<{loading?:boolean; file?:File; error?:string}>({});
 const mentorTransfer=useRef<AbortController>(null);
 const notifyRecoveredAnswer=useEffectEvent(()=>onAnswerReady?.());
 const cursor=useRef<{time:string;id:string}|undefined>(undefined),retry=useRef<{requestId:string;question:string;imageId?:string}|null>(null);
 const [uncertain,setUncertain]=useState(false);
 const [retryQuestion,setRetryQuestion]=useState('');
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
     if(!hasSensitiveQuestionText(request.question)){
      retry.current=request;
      setUncertain(true);
      setRetryQuestion(request.question);
      setCanResume(true);
     }else sessionStorage.removeItem(requestKey);
    }
    const savedDraft=sessionStorage.getItem(draftKey) ?? retry.current?.question ?? initialQuestion.slice(0,2000);
    if(hasSensitiveQuestionText(savedDraft))sessionStorage.removeItem(draftKey);
    else {draftText.current=savedDraft;setQuestion(savedDraft);}
   }catch{/* Storage may be disabled. */}
   setDraftReady(true);
  },0);
  return()=>window.clearTimeout(restore);
 },[draftKey,requestKey,initialQuestion]);
 const updateQuestion=useCallback((value:string)=>{
  imagePicker.current?.clearValidation();
  draftText.current=value;
  setQuestion(value);
  try{
   if(value.trim() && !hasSensitiveQuestionText(value))sessionStorage.setItem(draftKey,value);
   else if(retry.current)sessionStorage.setItem(draftKey,'');
   else sessionStorage.removeItem(draftKey);
  }catch{/* Keep the in-memory draft available. */}
 },[draftKey]);
 const [loadedVersion,setLoadedVersion]=useState(-1),[historyError,setHistoryError]=useState(''),[version,setVersion]=useState(0),[more,setMore]=useState(false),[olderBusy,setOlderBusy]=useState(false);
 const loaded=loadedVersion===version && draftReady;
 useUnsavedLearningChanges(!mentor && Boolean(busy || image.draft));
 const gate=useRef(false),alive=useRef(true),composer=useRef({dirty:false,locked:false});
 const [mentorLocked,setMentorLocked]=useState(false);
 const updateMentor=useCallback((state:{dirty:boolean;locked:boolean})=>{composer.current=state;setMentorLocked(state.locked);onStateChange(state);},[onStateChange]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mentorTransfer.current?.abort();};},[]);
 useEffect(()=>{if(!mentor)onStateChange({dirty:image.draft && !canResume,locked:image.busy || ((busy || uncertain) && !canResume)});},[busy,image.draft,image.busy,mentor,uncertain,canResume,onStateChange]);
 useEffect(()=>{
  if(!draftReady)return;
  const abort=new AbortController();let active=true;
  void questionRequest<{items:SavedAiExchange[];hasMore:boolean}>(aiHistoryUrl(context.enrollmentId,context.lessonId),undefined,abort.signal).then(data=>{
   if(!active)return;const items=data.items || [];setHistoryError('');setHistoryNotice(notice=>notice?.needsRefresh?undefined:notice);setTurns(savedTurns(items));setMore(data.hasMore);const last=items.at(-1);cursor.current=last?{time:last.createdAt,id:last.requestId}:undefined;
   const pending=retry.current&&items.find(i=>i.requestId===retry.current!.requestId);
   if(pending&&pending.status!=='pending'){if(pending.status==='succeeded'){notifyRecoveredAnswer();if(draftText.current.trim()===pending.question)updateQuestion('');setImage({id:null,busy:false,draft:false});setImageKey(k=>k+1);setError('');}clearRetry();setUncertain(false);}
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
  event.preventDefault();
  if(gate.current || historyAction || !loaded || pendingAnswer) return;
  if(checkRetry ? !retry.current : uncertain || historyError || image.busy || (image.draft && !image.id) || !question.trim() || sensitive) return;
  gate.current=true;setBusy(true);setError('');imagePicker.current?.clearValidation();
  const request=retry.current || {requestId:crypto.randomUUID(),question:question.trim(),...(image.id?{imageId:image.id}:{})};retry.current=request;
  try{sessionStorage.setItem(requestKey,JSON.stringify(request));setCanResume(true);}catch{/* Keep the dialog locked without a resumable request. */}
  try {
   const response=await fetch('/api/platform/curriculum-ai',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(55000),body:JSON.stringify({...request,enrollmentId:context.enrollmentId,lessonId:context.lessonId})});
   const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error || '답변을 불러오지 못했어요.'),{status:response.status});
   if(typeof data.answer!=='string' || !Array.isArray(data.sources))throw new Error('답변 형식을 확인하지 못했어요.');
   if(alive.current){const createdAt=new Date().toISOString();setTurns(old=>[...old,{role:'user',createdAt,text:request.question,imageAttached:Boolean(request.imageId),requestId:request.requestId,imageId:request.imageId,imageName:image.info?.name},{role:'assistant',requestId:request.requestId,createdAt,text:data.answer,result:data}]);onAnswerReady?.();if(draftText.current.trim()===request.question)updateQuestion('');setImage({id:null,busy:false,draft:false});setImageKey(k=>k+1);clearRetry();setUncertain(false);}
  }catch(cause){if(alive.current){const e=cause as Error&{status?:number};if(!e.status || e.status>=500 || e.status===409){setUncertain(true);setRetryQuestion(request.question);setVersion(v=>v+1);}else {setError(e.message);clearRetry();setUncertain(false);}}}
  finally{gate.current=false;if(alive.current)setBusy(false);}
 }
 async function manageTurn(turn:Turn,action:'feedback'|'incorrect'|'delete'){
  if(!turn.requestId || historyAction || busy || uncertain || olderBusy || !loaded)return;
  if(action==='delete'&&!window.confirm('이 질문과 답변을 내 AI 대화에서 삭제할까요? 이후 AI 답변에도 이 대화가 사용되지 않아요.'))return;
  setHistoryAction(true);
  setHistoryNotice(undefined);
  if(action==='incorrect')continueWithMentor(turn,true);
  try{
   const response=await fetch('/api/platform/curriculum-ai/history',{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({requestId:turn.requestId,action,helpful:!turn.helpful}),
   });
   if(!response.ok)throw new Error('AI history action failed');
   setTurns(previous=>action==='delete'
    ?previous.filter(item=>item.requestId!==turn.requestId)
    :previous.map(item=>item.role==='assistant'&&item.requestId===turn.requestId?{...item,helpful:action==='feedback'&&!turn.helpful,incorrect:action==='incorrect'}:item));
   setHistoryNotice({message:action==='delete'?'질문과 답변을 삭제했어요.':'답변 평가를 저장했어요.'});
  }catch{setHistoryNotice({message:'변경 결과를 확인하지 못했어요. 대화 새로고침 후 다시 시도해 주세요.',needsRefresh:true});}
  finally{setHistoryAction(false);}
 }
 function continueWithMentor(turn:Turn, incorrect=false){
  const original=turns.find(item=>item.role==='user' && item.requestId===turn.requestId);
  const safeText=(text:string)=>hasSensitiveQuestionText(text)?'[민감정보가 포함되어 내용을 옮기지 않았어요.]':text;
  const draft=[original?.text && '내 질문\n'+safeText(original.text), 'AI 참고 답변\n'+safeText(readableAnswer(turn.text)), incorrect?'어디가 틀렸나요?\n':'멘토에게 확인하고 싶은 점\n'].filter(Boolean).join('\n\n');
  setMentorDraft(draft.slice(0,10000));
  setMentor(true);
  if (!imagesEnabled || !original?.imageId || !original.requestId) return;
  mentorTransfer.current?.abort();
  const abort=new AbortController();
  mentorTransfer.current=abort;
  setMentorCapture({loading:true});
  const url='/api/platform/question-images?'+new URLSearchParams({ai:original.requestId});
  void fetch(url,{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])}).then(async response=>{
   if(!response.ok)throw new Error('Unable to load the saved capture');
   const blob=await response.blob();
   const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[blob.type];
   if(!extension || !blob.size || blob.size>10*1024*1024)throw new Error('Unsupported saved capture');
   if(!abort.signal.aborted)setMentorCapture({file:new File([blob],original.imageName || '화면 캡처.'+extension,{type:blob.type})});
  }).catch(()=>{if(!abort.signal.aborted)setMentorCapture({error:'이전 캡처를 불러오지 못했어요. 아래에서 다시 첨부할 수 있어요.'});});
 }
 const locked=busy || uncertain || historyAction;
 useEffect(()=>{
  if(!loaded || locked || mentor)return;
  const field=input.current;
  const active=document.activeElement;
  const dialog=field?.closest('dialog,[role=dialog]');
  if(dialog && (active===document.body || (active instanceof HTMLButtonElement && active.getAttribute('aria-label')==='닫기' && dialog.contains(active))))field?.focus({preventScroll:true});
 },[loaded,locked,mentor]);

 const usageGuide=<details className="curriculum-ai-guide"><summary>AI 사용·저장 안내{!compact && <span>OpenAI 전달 · 비공개 저장</span>}</summary><div><p>공개된 문샷 수업 자료에서 근거를 찾아 안내해요. 질문·최근 대화·관련 수업 자료와 이번에 첨부한 캡처가 OpenAI에 전달됩니다. AI 답변은 틀릴 수 있어요. 개인정보는 적지 마세요.</p><p>질문·AI 답변·첨부 내역은 이 수업과 ‘내 질문’에 자동 저장돼요. 이전 사진은 다시 첨부하지 않으면 다음 질문에 보내지 않아요.</p>{compact && imagesEnabled && <p>이미지 한 장(최대 10MB)을 붙여넣거나 질문 입력란에 끌어 놓을 수 있어요. 개인정보·비밀번호는 가려 주세요. 움직이는 이미지는 첫 화면만 확인해요.</p>}</div></details>;
 return <section className="curriculum-ai" aria-label="수업 AI 질문과 멘토 연결">
  <div className="curriculum-ai-switch" role="group" aria-label="답변 받을 대상"><button type="button" className={'btn'+(!mentor?' primary':'')} disabled={locked || image.busy || mentorLocked} aria-pressed={!mentor} onClick={()=>{if(mentor && composer.current.dirty && !window.confirm('수정 중인 멘토 질문을 닫고 AI 질문으로 돌아갈까요?'))return;mentorTransfer.current?.abort();setMentorCapture({});setMentorDraft('');setMentor(false);}}>AI에게 질문</button><button type="button" className={'btn'+(mentor?' primary':'')} disabled={locked || image.busy} aria-pressed={mentor} onClick={()=>setMentor(true)}>멘토에게 질문</button></div>
  {historyNotice&&<p role="status">{historyNotice.message}</p>}
  {mentor && <><p>멘토에게 전달할 내용과 캡처를 확인해 주세요. 기본은 비밀 질문입니다.</p>{mentorCapture.loading ? <p role="status">이전 캡처를 불러오고 있어요.</p> : <>{mentorCapture.error && <p role="status">{mentorCapture.error}</p>}<QuestionComposer initialContext={context} initialContent={mentorDraft} initialFile={mentorCapture.file} initialPrivate quick onStateChange={updateMentor} onCreated={onCreated}/></>}</>}
  <div className="curriculum-ai-body" hidden={mentor}>
   {showContext&&<p className="curriculum-ai-context"><b>질문할 수업</b><span>{context.label}</span></p>}
   {!compact&&usageGuide}
   <QuestionImageDropzone enabled={imagesEnabled} locked={locked || image.busy || mentorLocked} onFiles={files=>imagePicker.current?.paste(files)}><form className="curriculum-ai-composer" onSubmit={event=>void submit(event,uncertain)} onPaste={event=>{if(!imagesEnabled || locked || image.busy)return;const files=Array.from(event.clipboardData.items).filter(item=>item.kind==='file' && item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>file!==null);if(files.length){event.preventDefault();imagePicker.current?.paste(files);}}}><p className="meta curriculum-ai-privacy">{compact?'OpenAI에 전송돼요. 개인정보는 가려 주세요.':'비밀번호·카드번호 등 개인정보는 질문에 적지 마세요.'}</p><label className="field">궁금한 점<textarea ref={input} rows={compact?2:3} maxLength={questionLimit} disabled={busy || !draftReady} value={question} onChange={e=>updateQuestion(e.target.value)} placeholder="예: 이 수업의 프롬프트를 실행했는데 예시와 다른 결과가 나와요. 어떤 부분을 확인하면 될까요?"/></label>{question.length>=1800&&<small className="meta">{questionLimit-question.length}자 남았어요</small>}{imagesEnabled&&<><QuestionImagePicker key={imageKey} dragAndDrop ref={imagePicker} enrollmentId={context.enrollmentId} lessonId={context.lessonId} compact ai showHint={!compact} showReadyHint={Boolean(question.trim())} locked={locked || mentorLocked} changed={(id,uploading,draft,info)=>setImage({id,busy:uploading,draft,info})}/>{!compact && <small className="meta curriculum-ai-image-privacy">개인정보·비밀번호를 가린 캡처만 첨부해 주세요. 이번 질문에만 전달되며, 애니메이션은 첫 화면만 확인해요.</small>}</>}{image.id&&!question.trim()&&<p className="meta">캡처에서 궁금한 점을 한 줄만 적어 주세요.</p>}{sensitive&&<p role="alert" className="form-error">{sensitiveQuestionMessage}</p>}{error&&<p role="alert" className="form-error">{error}</p>}{uncertain && <p role="status">{pendingAnswer?'답변을 준비하고 있어요.':question.trim()!==retryQuestion?'연결을 확인하고 이전 질문을 다시 보내 주세요. 수정한 내용은 남겨 둘게요.':'연결을 확인하고 다시 보내 주세요.'}</p>}<button type="submit" className="btn primary" disabled={busy || historyAction || !loaded || pendingAnswer || (!uncertain && (Boolean(historyError) || image.busy || (image.draft && !image.id) || !question.trim() || sensitive))}>{busy?'수업 근거를 확인하고 있어요…':uncertain?'다시 보내기':'AI 답변 받기'}</button></form></QuestionImageDropzone>
   {compact&&usageGuide}
   <div className="curriculum-ai-toolbar"><div><h3>이 수업의 대화</h3>{!compact && <p>질문과 답변은 자동으로 저장돼요.</p>}</div>{(!uncertain && (!compact || historyError || pendingAnswer || historyNotice?.needsRefresh)) && <button type="button" className="btn small" disabled={busy || historyAction || image.busy || !loaded || olderBusy} onClick={()=>setVersion(v=>v+1)}>대화 새로고침</button>}</div>
   {compact&&turns.length>2&&<button type="button" className="btn small" aria-expanded={expandedHistory} onClick={()=>setExpandedHistory(value=>!value)}>{expandedHistory?'이전 대화 접기':'이전 대화 보기'}</button>}
   {more&&(!compact||expandedHistory)&&<button type="button" className="btn small curriculum-ai-older" disabled={busy || historyAction || !loaded || olderBusy} onClick={()=>void older()}>이전 대화 더 보기</button>}
   {!loaded&&<p role="status">저장된 대화를 불러오고 있어요.</p>}{historyError&&!uncertain&&<p role="alert">대화를 불러오지 못했어요. {historyError} 위의 ‘대화 새로고침’으로 다시 확인해 주세요.</p>}
   <div className="curriculum-ai-turns" role="log" aria-label="AI 질문 대화" aria-live="polite">{(compact&&!expandedHistory?turns.slice(-2):turns).map((turn,i)=><article key={turn.requestId?turn.role+':'+turn.requestId:i} className={'curriculum-ai-turn '+turn.role}><b className="curriculum-ai-speaker">{turn.role==='user'?'내 질문':'AI 참고 답변'}</b>{turn.createdAt&&<time className="meta" dateTime={turn.createdAt}>{messageTime.format(new Date(turn.createdAt))}</time>}{turn.result?.captureLesson&&<p><Link href={`/learn/${context.enrollmentId}/${turn.result.captureLesson.lessonId}`}>{turn.result.captureLesson.dayNumber===undefined?'':turn.result.captureLesson.dayNumber+'일차 · '}{turn.result.captureLesson.title}</Link>에서 다시 질문해 주세요.</p>}{!turn.result?.captureLesson && <p>{turn.role==='assistant'?readableAnswer(turn.text):turn.text}</p>}{turn.imageAttached&&<div className="curriculum-ai-attachment"><small>화면 캡처 1장 함께 전달</small><QuestionImage questionId={turn.requestId!} aiRequestId={turn.requestId} imageId={turn.imageId}/></div>}{turn.result&&<div className="curriculum-ai-sources">{turn.result.sources.length>0&&<small>이 답변에 인용한 근거 {turn.result.sources.length}개</small>}{turn.result.sources.map(s=><details key={s.id}><summary>{s.title} · 근거 보기</summary><p>{s.excerpt}</p><small>{s.revision?'본문 버전 '+s.revision.slice(0,8):'기존 본문'}</small><p><Link href={`/learn/${context.enrollmentId}/${s.lessonId}${s.blockId ? '#lesson-block-' + encodeURIComponent(s.blockId) : '#lesson-reading-start'}`} target={onLessonPage && s.lessonId===context.lessonId?undefined:'_blank'} rel="noopener noreferrer">{onLessonPage && s.lessonId===context.lessonId?'이 수업의 근거 위치로 이동':'참고 수업 새 창으로 열기'}</Link></p></details>)}{turn.result.needsMentor&&!turn.result.captureLesson&&<p>멘토 확인을 권해요. 아래에서 이어서 질문할 수 있어요.</p>}</div>}
     {turn.role==='assistant' && !turn.pending && <div className="ai-answer-actions" role="group" aria-label="답변 도구">
       {turn.result && <button type="button" className="ai-answer-mentor" disabled={locked || image.busy} onClick={()=>continueWithMentor(turn)}><MessageCircle aria-hidden="true" size={16}/>멘토에게 이어서 질문</button>}
       <div className="ai-answer-secondary">
         {turn.result && <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(turn.result?.captureLesson ? turn.result.captureLesson.title+'에서 다시 질문해 주세요.' : readableAnswer(turn.text));setCopyStatus('답변을 복사했어요.');}catch{setCopyStatus('복사하지 못했어요. 답변을 선택해 직접 복사해 주세요.');}}}><Copy aria-hidden="true" size={15}/>답변 복사</button>}
         {turn.requestId && <details className="ai-answer-more"><summary><MoreHorizontal aria-hidden="true" size={16}/>더보기</summary>
           <div className="ai-answer-options">
             {turn.result && <><button type="button" aria-pressed={Boolean(turn.helpful)} disabled={locked || olderBusy || !loaded} onClick={()=>void manageTurn(turn,'feedback')}>도움이 됐어요</button>
             <button type="button" aria-pressed={Boolean(turn.incorrect)} disabled={locked || image.busy || olderBusy || !loaded} onClick={()=>void manageTurn(turn,'incorrect')}>잘못된 답변 · 멘토에게 확인</button></>}
             <button type="button" className="ai-answer-delete" disabled={locked || olderBusy || !loaded} onClick={()=>void manageTurn(turn,'delete')}>이 질문과 답변 삭제</button>
           </div>
         </details>}
       </div>
     </div>}</article>)}</div>
   <div role="status">{copyStatus}</div>
   {busy&&<><article className="curriculum-ai-turn user"><b className="curriculum-ai-speaker">내 질문</b><p>{question.trim()}</p></article><p role="status">답변을 준비하고 있어요.</p></>}
   {loaded&&!busy&&!historyError&&!turns.length&&<p className="curriculum-ai-empty">{compact ? '아직 이 수업에 남긴 질문이 없어요.' : <>수업에서 막힌 부분을 편하게 물어보세요.<br/>질문과 답변은 여기에 차곡차곡 남아요.</>}</p>}

  </div>
 </section>;
}
