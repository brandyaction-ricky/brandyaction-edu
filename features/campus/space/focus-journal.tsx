'use client';
import {useEffect,useMemo,useState} from 'react';
import type {CampusSnapshot} from '../contracts';
import {createFocusTransport} from '../focus-client';
import type {FocusSession} from '../focus-domain';
import {learnerMetrics} from '../learner-metrics';
import {useCampusDraftGuard} from '../ui/draft-guard';
import styles from './panel.module.css';

// A finished study-room focus block becomes an action-journal entry: the form starts a focus record and finishes it in one go.
// An unfinished 15-minute run (one per enrollment) is finished instead of starting a second record.
// ponytail: the entry keeps no duration (elapsed_seconds is capped at the 15-minute run). Add a column if the journal should show minutes.
export function FocusJournalForm({snapshot,demo,minutes,onSaved,onSkip}:{snapshot:CampusSnapshot;demo:boolean;minutes:number;onSaved:()=>void;onSkip:()=>void}){
 const transport=useMemo(()=>createFocusTransport(snapshot,demo),[snapshot,demo]);
 const [open,setOpen]=useState<FocusSession|null|undefined>(undefined);
 const [lessonId,setLessonId]=useState(learnerMetrics(snapshot).nextActions[0]?.lessonId||snapshot.lessons[0]?.id||'');
 const [action,setAction]=useState(''),[result,setResult]=useState(''),[next,setNext]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useCampusDraftGuard(!!(action.trim()||result.trim()||next.trim()),busy);
 useEffect(()=>{const abort=new AbortController();transport.read(abort.signal).then(r=>setOpen(r.session&&r.session.status!=='finished'?r.session:null)).catch(e=>{if(!abort.signal.aborted){setOpen(null);setError((e as Error).message);}});return()=>abort.abort();},[transport]);
 const lesson=snapshot.lessons.find(l=>l.id===lessonId);
 async function save(){
  if(busy||!snapshot.selectedEnrollmentId)return;setBusy(true);setError('');
  try{
   let session=open;
   if(!session){
    if(!lesson||!action.trim())return;
    session=(await transport.write({kind:'start',requestId:crypto.randomUUID(),enrollmentId:snapshot.selectedEnrollmentId,lessonId:lesson.id,lessonVersion:lesson.version,actionText:action.trim()})).session;
    if(!session)throw Error('저장 여부를 확인하지 못했습니다. 다시 시도해 주세요.');
    setOpen(session);
   }
   await transport.write({kind:'finish',sessionId:session.id,expectedRevision:session.revision,resultNote:result,nextStep:next});
   onSaved();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <form className={styles.journalForm} aria-label="실행 수첩에 남기기" onSubmit={e=>{e.preventDefault();void save();}}>
  <h4>오늘 한 일을 실행 수첩에 남겨요</h4>
  <p>{minutes>0?`${minutes}분 집중했어요. `:''}적어 두면 다음에 여기서 다시 시작할 수 있어요. 나만 볼 수 있어요.</p>
  {open===undefined?<p role="status">실행 기록을 확인하고 있어요.</p>:!open&&!snapshot.lessons.length?<p role="status">공개된 수업이 생기면 실행 수첩에 남길 수 있어요.</p>:<>
   {open?<p>진행 중인 15분 실행 「{open.action_text}」에 이어서 남겨요.</p>:<>
    {snapshot.lessons.length>1&&<label className={styles.field}>어느 수업과 이어지나요?<select aria-label="이어지는 수업" value={lessonId} disabled={busy} onChange={e=>setLessonId(e.target.value)}>{snapshot.lessons.map(l=><option key={l.id} value={l.id}>{l.day}일차 · {l.title}</option>)}</select></label>}
    <label className={styles.field}>무엇을 했나요?<input aria-label="한 일" maxLength={300} value={action} disabled={busy} onChange={e=>setAction(e.target.value)} placeholder="예: 랜딩페이지 첫 문단 쓰기"/></label>
   </>}
   <label className={styles.field}>어디까지 했나요?<textarea aria-label="오늘의 결과" maxLength={1000} rows={2} value={result} disabled={busy} onChange={e=>setResult(e.target.value)} placeholder="예: 첫 문단을 고객이 얻는 변화 중심으로 고쳤어요."/></label>
   <label className={styles.field}>다음에 시작할 일은?<textarea aria-label="다음에 시작할 일" maxLength={500} rows={2} value={next} disabled={busy} onChange={e=>setNext(e.target.value)} placeholder="예: 고객 한 명에게 읽어 주고 반응 듣기"/></label>
  </>}
  {error&&<p role="alert">{error}</p>}
  <div className={styles.controls}><button type="button" disabled={busy} onClick={onSkip}>남기지 않기</button>{open!==undefined&&(open||!!snapshot.lessons.length)&&<button className={styles.primary} disabled={busy||!result.trim()||!next.trim()||(!open&&(!action.trim()||!lesson))}>{busy?'저장 중…':'실행 수첩에 저장'}</button>}</div>
 </form>;
}
