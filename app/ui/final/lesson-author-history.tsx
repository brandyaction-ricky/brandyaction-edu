'use client';
import {useEffect,useRef,useState} from 'react';
import {groupAuthorHistory,type AuthorHistoryItem,type AuthorHistoryPage} from '@/lib/lesson-author-history';
import './lesson-author-history.css';
const date=(v:string)=>new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const label=(r:AuthorHistoryItem)=>r.published?'학생에게 반영':r.baseline?'기존 공개본':r.source==='manual'?'직접 저장':r.source==='backup'?'동시 편집 보관본':r.source==='autosave'?'자동저장':'이전 저장';
export function LessonAuthorHistory({lessonId,revision,disabled,onRestore}:{lessonId:string;revision:string|null;disabled:boolean;onRestore:(id:string)=>void}){
 const [opened,setOpened]=useState(false),[rows,setRows]=useState<AuthorHistoryItem[]>([]),[next,setNext]=useState<AuthorHistoryPage['next']>(null);
 const [mode,setMode]=useState('important'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[editor,setEditor]=useState('');
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[seen,setSeen]=useState(revision);
 const sequence=useRef(0),abort=useRef<AbortController|null>(null),filters=useRef({mode:'important',from:'',to:'',editor:''});
 useEffect(()=>()=>{++sequence.current;abort.current?.abort();},[]);
 async function load(more=false,selected=filters.current){
  const run=++sequence.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
  setLoading(true);setError('');if(!more){setRows([]);setNext(null);setLoaded(false);}
  try{
   const q=new URLSearchParams({lesson:lessonId,history:'1',...selected});for(const k of ['from','to','editor'])if(!q.get(k))q.delete(k);
   if(more&&next){q.set('beforeAt',next.at);q.set('beforeId',next.id);}
   const response=await fetch('/api/admin/lesson-author?'+q,{cache:'no-store',signal:controller.signal}),data=await response.json();
   if(!response.ok||!Array.isArray(data.rows))throw Error(data.error||'저장 기록을 불러오지 못했습니다.');
   if(run!==sequence.current)return;
   setRows(old=>more?[...old,...data.rows.filter((item:AuthorHistoryItem)=>!old.some(r=>r.revision===item.revision))]:data.rows);setNext(data.next);setLoaded(true);if(!more)setSeen(revision);
  }catch(e){if(!controller.signal.aborted&&run===sequence.current)setError(e instanceof Error?e.message:'기록을 불러오지 못했습니다.');}
  finally{if(run===sequence.current)setLoading(false);}
 }
 function item(r:AuthorHistoryItem){return <div className="lesson-author-history" key={r.revision}><div><strong>{label(r)}</strong><span>{date(r.createdAt)} · {r.editor}</span><span>{r.note||r.title||'제목 없음'}</span></div><button className="btn small" type="button" disabled={disabled||loading} onClick={()=>onRestore(r.revision)}>이 내용 불러오기</button></div>;}
 return <details className="author-history-browser" onToggle={e=>{if(e.target!==e.currentTarget)return;const open=e.currentTarget.open;setOpened(open);if(open&&!loaded&&!loading)void load();}}>
  <summary>이전 초안·반영 이력</summary>
  {opened&&<>
   <p>직접 저장과 학생 반영 기록부터 보여 드립니다. 자동저장을 포함한 이전 기록도 끝까지 찾아볼 수 있어요. 불러와도 학생 화면은 바뀌지 않습니다.</p>
   <form className="author-history-filters" onSubmit={e=>{e.preventDefault();if(from&&to&&from>to){setError('시작 날짜가 종료 날짜보다 늦습니다.');return;}filters.current={mode,from,to,editor};void load(false);}}>
    <label>기록 종류<select value={mode} onChange={e=>setMode(e.target.value)}><option value="important">주요 기록</option><option value="all">전체 기록</option></select></label>
    <label>시작 날짜<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>종료 날짜<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    <label>편집자<input value={editor} maxLength={100} onChange={e=>setEditor(e.target.value)} placeholder="관리자 이름"/></label><button className="btn small" disabled={loading} type="submit">기록 찾기</button>
   </form>
   <small>한국 시간 기준 · 과거 기록은 자동·수동 구분 없이 ‘이전 저장’으로 표시됩니다.</small>
   {seen!==revision&&<p role="status">새 저장 기록이 있습니다. <button type="button" className="btn small" disabled={loading} onClick={()=>void load()}>최신 기록 보기</button></p>}
   {error&&<p role="alert">{error} <button type="button" className="btn small" disabled={loading} onClick={()=>void load()}>다시 불러오기</button></p>}
   {groupAuthorHistory(rows).map(group=>group.length===1?item(group[0]):<details className="author-history-group" key={group[0].revision}><summary>{group[0].source==='autosave'?'자동저장':'이전 저장'} {group.length}회 · {group[0].editor} · {date(group.at(-1)!.createdAt)} ~ {date(group[0].createdAt)}</summary>{group.map(item)}</details>)}
   {loaded&&!rows.length&&!loading&&<p>조건에 맞는 기록이 없습니다. ‘전체 기록’을 선택하면 자동저장과 이전 저장본도 확인할 수 있어요.</p>}
   {loading&&<p role="status">기록을 불러오는 중…</p>}
   {next&&<button className="btn" type="button" disabled={loading} onClick={()=>void load(true)}>이전 기록 더 보기</button>}
   {loaded&&rows.length>0&&<p className="meta">현재 {rows.length}개 기록을 불러왔습니다. 자동저장은 같은 편집자의 10분 이내 연속 기록을 묶어 표시합니다.{next?' 더 불러오면 묶음에 이전 기록이 추가됩니다.':' 마지막 기록까지 확인했습니다.'}</p>}
  </>}
 </details>;
}
