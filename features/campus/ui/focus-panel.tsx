'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Timer,Play,Pause,ArrowUpRight,ArrowRight,BookmarkCheck,RefreshCw,Check} from 'lucide-react';
import type {CampusSnapshot} from '../contracts';
import {learnerMetrics} from '../learner-metrics';
import {remainingSeconds} from '../focus-domain';
import {createFocusTransport,type FocusResponse,type FocusWrite} from '../focus-client';
import {useCampusDraftGuard} from './draft-guard';
import styles from './focus-panel.module.css';

export function FocusPanel({snapshot,demo,onOpen}:{snapshot:CampusSnapshot;demo:boolean;onOpen:(lessonId:string)=>void}){
  const transport=useMemo(()=>createFocusTransport(snapshot,demo),[snapshot,demo]);
  const next=learnerMetrics(snapshot).nextActions[0];
  const [data,setData]=useState<FocusResponse|null>(null);
  const [error,setError]=useState('');const [disabled,setDisabled]=useState(false);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);
  const [lessonId,setLessonId]=useState(next?.lessonId||snapshot.lessons[0]?.id||'');
  const [action,setAction]=useState('');const [result,setResult]=useState('');const [nextStep,setNextStep]=useState('');
  const [finishing,setFinishing]=useState(false);const [saved,setSaved]=useState(false);const [serverClock,setServerClock]=useState(0);
  useCampusDraftGuard(!!(action.trim()||result.trim()||nextStep.trim()),busy);
  const lastSessionId=useRef<string|null>(null);const inFlight=useRef(false);
  const startAttempt=useRef<{signature:string;requestId:string}|null>(null);const generation=useRef(0);const controller=useRef<AbortController|null>(null);
  const session=data?.session;const active=session&&session.status!=='finished';
  const currentLesson=snapshot.lessons.find(l=>l.id===session?.lesson_id);
  const accept=useCallback((response:FocusResponse)=>{if(response.session?.id!==lastSessionId.current){setResult('');setNextStep('');setFinishing(false);}lastSessionId.current=response.session?.id||null;if(response.session?.status==='finished')startAttempt.current=null;setData(response);setServerClock(Date.parse(response.serverNow));setDisabled(false);},[]);
  const cancelPending=useCallback(()=>{generation.current+=1;controller.current?.abort();inFlight.current=false;},[]);
  async function load(){
    cancelPending();const abort=new AbortController();controller.current=abort;const token=++generation.current;
    setLoading(true);setBusy(false);setData(null);setError('');setSaved(false);
    try{const response=await transport.read(abort.signal);if(token===generation.current&&!abort.signal.aborted)accept(response);}
    catch(err){if(token===generation.current&&!abort.signal.aborted){const e=err as Error&{status?:number};setError(e.message);setDisabled(e.status===404);if(e.status===401||e.status===403){setResult('');setNextStep('');}}}
    finally{if(token===generation.current)setLoading(false);}
  }
  useEffect(()=>{
    const abort=new AbortController();controller.current=abort;const token=++generation.current;
    transport.read(abort.signal).then(response=>{if(token===generation.current&&!abort.signal.aborted){accept(response);setError('');}}).catch(err=>{if(token===generation.current&&!abort.signal.aborted){setError(err.message);setDisabled(err.status===404);if(err.status===401||err.status===403){setData(null);setResult('');setNextStep('');}}}).finally(()=>{if(token===generation.current){setLoading(false);setBusy(false);}});
    return cancelPending;
  },[transport,accept,cancelPending]);
  useEffect(()=>{if(!data||session?.status!=='running')return;const base=Date.parse(data.serverNow),anchor=performance.now();const timer=setInterval(()=>setServerClock(base+performance.now()-anchor),1000);return()=>clearInterval(timer);},[data,session?.status]);
  async function write(command:FocusWrite){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setSaved(false);const token=generation.current;
    try{const response=await transport.write(command,controller.current?.signal);if(token!==generation.current)return;accept(response);if(command.kind==='start')setAction('');if(command.kind==='finish'){setFinishing(false);setSaved(true);setAction('');setResult('');setNextStep('');startAttempt.current=null;}}
    catch(err){if(token===generation.current){const e=err as Error&{status?:number};setError(e.message);if(e.status===401||e.status===403){setData(null);setResult('');setNextStep('');}}}
    finally{if(token===generation.current){inFlight.current=false;setBusy(false);}}
  }
  function start(){const lesson=snapshot.lessons.find(l=>l.id===lessonId);if(!lesson||!action.trim()||!snapshot.selectedEnrollmentId)return;const signature=[lesson.id,lesson.version,action.trim()].join('|');if(startAttempt.current?.signature!==signature)startAttempt.current={signature,requestId:crypto.randomUUID()};void write({kind:'start',requestId:startAttempt.current.requestId,enrollmentId:snapshot.selectedEnrollmentId,lessonId:lesson.id,lessonVersion:lesson.version,actionText:action.trim()});}
  const seconds=session?remainingSeconds(session,serverClock):900;
  const clock=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  if(!snapshot.selectedEnrollmentId)return null;
  return <section className={styles.panel} aria-labelledby="focus-heading"><div className={styles.top}><div><span className={styles.eyebrow}>ONE SMALL MOVE</span><h2 id="focus-heading">오늘은 15분만, 한 걸음.</h2><p>본업이 바쁜 날에도 작은 실행 하나는 남길 수 있어요.</p></div><span className={styles.icon}><Timer size={23}/></span></div>
    {demo&&<p className={styles.demo}>체험 기록은 이 브라우저에만 저장됩니다. 실제 회원 기록이 아닙니다.</p>}
    {loading?<p role="status" className={styles.notice}>지난 실행 기록을 확인하고 있어요.</p>:<>
    {error&&<div role="alert" className={styles.notice}>{error}{!disabled&&<button onClick={()=>void load()} disabled={busy}><RefreshCw size={14}/> 기록 다시 확인</button>}</div>}
    {saved&&<p role="status" className={styles.success}><Check size={17}/> 오늘의 실행과 다음 할 일을 저장했어요.</p>}
    {!disabled&&!error&&!active&&session?.status==='finished'&&<div className={styles.resume}><BookmarkCheck size={21}/><div><span className={styles.eyebrow}>WELCOME BACK</span><h3>지난번에 남겨둔 다음 한 걸음</h3><p className={styles.note}>{session.next_step}</p><details><summary>지난 실행 기록 보기</summary><p>선택한 일: {session.action_text}</p><p>남긴 결과: {session.result_note}</p><p>{new Date(session.updated_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST</p></details><button className={styles.textButton} disabled={!currentLesson} onClick={()=>{setLessonId(session.lesson_id);setAction(session.next_step.slice(0,300));document.getElementById('focus-action')?.focus();}}>이 할 일로 다시 시작 <ArrowRight size={15}/></button>{!currentLesson&&<p>이전 수업의 공개 상태가 바뀌었어요. 아래에서 다른 수업을 선택해 주세요.</p>}</div></div>}
    {!disabled&&!active&&<form className={styles.form} onSubmit={e=>{e.preventDefault();start();}}><label htmlFor="focus-lesson">어느 수업을 이어갈까요?</label><select id="focus-lesson" value={lessonId} disabled={busy||!!error} onChange={e=>setLessonId(e.target.value)}>{snapshot.lessons.map(l=><option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select><label htmlFor="focus-action">15분 안에 해볼 작은 일 하나</label><input id="focus-action" maxLength={300} value={action} disabled={busy||!!error} onChange={e=>setAction(e.target.value)} placeholder="예: 피드백을 읽고 제안서 첫 문장 고치기"/><div className={styles.formBottom}><p>완벽하게 끝내기보다, 다음 단계로 나아갈 만큼만.</p><button className={styles.primary} type="submit" disabled={busy||!!error||!action.trim()||!lessonId}><Play size={15}/>{busy?'저장 중…':'15분 실행 시작'}</button></div>{!snapshot.lessons.length&&<p>공개된 수업을 기다리고 있어요.</p>}</form>}
    {active&&<><div className={styles.active}><div className={styles.activeCopy}><span className={styles.eyebrow}>{session.status==='paused'?'PAUSED · 잠깐 쉬어도 괜찮아요':'IN PROGRESS · 하던 일 이어가기'}</span><h3>{session.action_text}</h3><p>{currentLesson?`${currentLesson.day}일차 · ${currentLesson.title}`:'이전 수업의 실행 기록'}</p>{data?.currentLessonVersion!==session.lesson_version&&<p className={styles.warning}>수업이 수정되었거나 공개 상태가 바뀌었어요. 남긴 기록은 보존되며 현재 수업 내용을 다시 확인해 주세요.</p>}<button className={styles.textButton} disabled={busy||!currentLesson||!data?.currentLessonVersion} onClick={()=>onOpen(session.lesson_id)}>수업 열고 실행하기 <ArrowUpRight size={16}/></button></div><div className={styles.timer}><span>목표 시간까지</span><strong aria-label="남은 실행 시간">{clock}</strong><small>{seconds===0?'목표 시간이 지났어요. 결과를 남겨볼까요?':session.status==='paused'?'타이머가 멈춰 있어요':'창을 이동해도 실행 기록은 이어져요'}</small></div></div>
      <div className={styles.controls}><button disabled={busy||!!error||(session.status==='paused'&&seconds===0)} onClick={()=>void write({kind:session.status==='paused'?'resume':'pause',sessionId:session.id,expectedRevision:session.revision})}>{session.status==='paused'?<Play size={15}/>:<Pause size={15}/>} {session.status==='paused'?'실행 다시 이어가기':'잠깐 멈추기'}</button><button className={styles.primary} disabled={busy||!!error} onClick={()=>setFinishing(true)}>오늘 한 일 남기기 <ArrowRight size={15}/></button></div>
      {finishing&&<form className={styles.finishForm} onSubmit={e=>{e.preventDefault();void write({kind:'finish',sessionId:session.id,expectedRevision:session.revision,resultNote:result,nextStep});}}><h3>다음에 돌아올 나에게</h3><label htmlFor="focus-result">오늘 어디까지 했나요?</label><textarea id="focus-result" disabled={busy} value={result} onChange={e=>setResult(e.target.value)} maxLength={1000} rows={3} required placeholder="예: 제안서 첫 문장을 고객이 얻는 변화 중심으로 고쳤어요."/><label htmlFor="focus-next">다음에 시작할 일은?</label><textarea id="focus-next" disabled={busy} value={nextStep} onChange={e=>setNextStep(e.target.value)} maxLength={500} rows={2} required placeholder="예: 실제 고객 한 명에게 이 문장이 이해되는지 물어보기"/><div className={styles.controls}><button type="button" onClick={()=>setFinishing(false)} disabled={busy}>계속 작업하기</button><button className={styles.primary} disabled={busy||!result.trim()||!nextStep.trim()||!!error}>{busy?'저장 중…':'기록 저장하고 마무리'}</button></div></form>}
    </>}
    </>}
    <p className={styles.footnote}>개인 실행 메모입니다. 타이머는 학습 시간을 인증하지 않으며 과제 제출·승인·점수를 바꾸지 않습니다. 개인정보는 적지 마세요.</p>
  </section>;
}
