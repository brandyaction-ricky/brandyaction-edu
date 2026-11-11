'use client';
import {useEffect,useRef,useState} from 'react';
import {StudentConnections} from '../student-connections';
import {BotOfficeModel,type BotDocument,type BotProfile} from '@/public/campus/world/office/bot-profile.mjs';
import {useCampusDraftGuard} from '../../ui/draft-guard';
import {campusActivity} from '../../analytics/client';
import {useDirectory} from './directory';
import styles from './panel.module.css';
type Saved={document:BotDocument;revision:string|null;updated_at:string|null};
export function PersonalOffice({enrollmentId,demo=false,onChange,onJobs}:{enrollmentId:string;demo?:boolean;onChange?:(document:BotDocument)=>void;onJobs?:(employee:{id:string;name:string})=>void}){
 const [loaded,setLoaded]=useState(demo);
 const [saved,setSaved]=useState<Saved>({document:new BotOfficeModel().getDocument(),revision:null,updated_at:null}),[loading,setLoading]=useState(!demo),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[name,setName]=useState(''),[telegram,setTelegram]=useState(''),[duties,setDuties]=useState('');const locked=useRef(false),onChangeRef=useRef(onChange);useEffect(()=>{onChangeRef.current=onChange;},[onChange]);
 const [epoch,setEpoch]=useState(0),[local,setLocal]=useState<BotProfile[]>([]);
 const dir=useDirectory(enrollmentId,!demo,epoch);
 const employees=demo?local:(dir.data?.employees??[]),desks=saved.document.profiles.filter(p=>p.employeeId!=='manager');
 function changed(){setEpoch(v=>v+1);}
 useCampusDraftGuard(!!(name||telegram||duties),busy,'personal-office');
 async function refresh(signal?:AbortSignal){if(demo)return;const r=await fetch('/api/campus/office/agents?enrollmentId='+enrollmentId,{cache:'no-store',signal});const data=await r.json();if(!r.ok)throw Error(data.error||'내 직원을 불러오지 못했어요.');setSaved(data);setLoaded(true);onChangeRef.current?.(data.document);}
 useEffect(()=>{const c=new AbortController();void Promise.resolve().then(()=>refresh(c.signal)).catch(e=>{if(e.name!=='AbortError')setMessage(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[enrollmentId,demo]); // eslint-disable-line react-hooks/exhaustive-deps
 async function save(document:BotDocument){if(locked.current||!loaded)return;locked.current=true;setBusy(true);setMessage('');try{
  const clean=new BotOfficeModel().restore(document);let data:Saved;
  if(demo){data={document:clean,revision:crypto.randomUUID(),updated_at:new Date().toISOString()};}
  else{const r=await fetch('/api/campus/office/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollmentId,document:clean,revision:crypto.randomUUID(),expectedRevision:saved.revision})});data=await r.json();if(!r.ok)throw Error((data as unknown as {error:string}).error||'저장하지 못했어요.');}
  setSaved(data);changed();if(demo)setLocal(old=>[...new Map([...old,...clean.profiles.filter(p=>p.employeeId!=='manager')].map(p=>[p.employeeId,p])).values()]);onChangeRef.current?.(clean);window.dispatchEvent(new CustomEvent('campus:office-saved',{detail:clean}));campusActivity('bot_save');setMessage(demo?'미리보기에 배치했어요.':'내 계정에 직원을 저장했어요.');setName('');setTelegram('');setDuties('');
 }catch(e){setMessage((e as Error).message);}finally{locked.current=false;setBusy(false);}}
 async function add(){
  if(locked.current)return;locked.current=true;setBusy(true);setMessage('');
  try{if(demo){const p=new BotOfficeModel().saveEmployee({name,telegramInput:telegram,duties}).profiles[1];
    if(local.some(v=>v.telegramUrl===p.telegramUrl))throw Error('이미 등록한 봇입니다.');setLocal([...local,p]);
   }else{const r=await fetch('/api/campus/office/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',enrollmentId,name,telegram,duties})});const d=await r.json();if(!r.ok)throw Error(d.error);}
   setName('');setTelegram('');setDuties('');dir.first();changed();setMessage('직원을 등록했어요.');
  }catch(e){setMessage((e as Error).message);}finally{locked.current=false;setBusy(false);}
 }
 function place(p:BotProfile){
  const document=structuredClone(saved.document),seat=[1,2,3,4,5,6,7].find(n=>!desks.some(d=>d.seatIndex===n));
  if(seat){document.profiles.push({...p,seatIndex:seat});void save(document);}
 }
 function unseat(p:BotProfile){void save({...saved.document,profiles:saved.document.profiles.filter(d=>d.employeeId!==p.employeeId)});}
 async function importFile(file:File){try{if(file.size>18000)throw Error('직원 목록 JSON 파일은 18KB 이내로 넣어 주세요.');const raw=JSON.parse(await file.text()),model=new BotOfficeModel();await save(model.restore(raw.botOffice||raw));}catch{setMessage('윤익님 사무실에서 내보낸 직원 목록 JSON 파일을 확인해 주세요. 봇 토큰은 넣지 마세요.');}}
 return <section className={styles.office}><header><small>내가 만든 AI 직원들이 모이는 곳</small><h2>내 AI 직원</h2><p>수업에서 만든 텔레그램 봇을 등록한 뒤 보고를 연결하면, 직원별 업무와 결과를 확인할 수 있어요.</p></header>{message&&<p role="status" className={styles.notice}>{message}</p>}{loading?<p role="status">내 직원을 불러오고 있어요…</p>:!loaded?<div><p>저장된 직원을 확인한 뒤 편집할 수 있어요.</p><button onClick={()=>void refresh().catch(e=>setMessage(e.message))}>내 직원 다시 불러오기</button></div>:<>
 <form onSubmit={e=>{e.preventDefault();add();}}><h3>직원 추가</h3><label>직원 이름<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="예: 콘텐츠 기획 담당"/></label><label>텔레그램 봇 주소<input required value={telegram} maxLength={200} onChange={e=>setTelegram(e.target.value)} placeholder="https://t.me/my_marketing_bot"/></label><label>담당 업무<textarea maxLength={500} value={duties} onChange={e=>setDuties(e.target.value)} placeholder="예: 이번 주 콘텐츠 아이디어 정리"/></label><button className={styles.primary} disabled={busy}>{busy?'저장 중…':'직원 등록하기'}</button></form>
 {!demo&&process.env.NEXT_PUBLIC_APP_ENV==='development' && process.env.NEXT_PUBLIC_SUPABASE_URL==='https://vjmjhaidlqkmascdjocw.supabase.co' && <StudentConnections key={enrollmentId} enrollmentId={enrollmentId} employees={employees} onJobs={onJobs}/>}
 <section aria-label="사무실 좌석"><h3>사무실 좌석 <small>{desks.length} / 7</small></h3>
 <p>총괄관리자는 고정이에요. 자리를 비워도 직원의 보고 연결과 업무 기록은 그대로 남아요.</p>
 <ol className={styles.seats}>{[1,2,3,4,5,6,7].map(n=>{const p=desks.find(d=>d.seatIndex===n);return <li key={n}><small>{n}번 자리</small><strong>{p?.name||'빈자리'}</strong>{p&&<button type="button" disabled={busy} onClick={()=>unseat(p)}>자리 비우기</button>}</li>;})}</ol></section>
 <h3>전체 직원 목록</h3>{dir.error&&<p role="alert">{dir.error}</p>}
 <div className={styles.roster}>{employees.map(p=>{const seat=desks.find(d=>d.employeeId===p.employeeId);return <article key={p.employeeId}><div><strong>{p.name}</strong><span>{seat?seat.seatIndex+'번 자리':'미배치'}</span></div>{p.duties&&<p>{p.duties}</p>}<div className={styles.controls}>
 {onJobs&&!demo&&<button type="button" onClick={()=>onJobs({id:p.employeeId,name:p.name})}>업무·결과 보기</button>}
 {!seat&&<button type="button" disabled={busy||desks.length>=7} onClick={()=>place(p)}>빈자리에 배치</button>}
 {p.telegramUrl&&<a href={p.telegramUrl} target="_blank" rel="noopener noreferrer">텔레그램 열기 ↗</a>}</div></article>;})}</div>
 {!demo&&<><div className={styles.controls}><button disabled={dir.page===1} onClick={dir.prev}>이전 직원 목록</button><span>{dir.page}페이지</span><button disabled={!dir.data?.next} onClick={dir.next}>다음 직원 목록</button></div>
</>}

 <details><summary>기존 사무실 직원 목록 가져오기</summary><p>윤익님 프로그램의 직원 목록 JSON을 가져오면 같은 외형과 좌석으로 배치됩니다. 좌석 배치만 교체하며, 기존 직원과 기록은 유지합니다.</p><label>직원 목록 JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value='';}}/></label></details>
 <footer><span>일반 직원 {desks.length}/7 자리 · {demo?'미리보기':saved.updated_at?'계정에 저장됨':'아직 저장 전'}</span><button disabled={busy||demo} onClick={()=>void refresh().then(changed).catch(e=>setMessage(e.message))}>다른 기기의 변경 불러오기</button></footer><p className={styles.note}>연결한 직원의 업무와 결과는 자리 배치와 관계없이 작업함에서 확인할 수 있어요. 봇 비밀키를 입력할 필요는 없습니다.</p></>}</section>;
}
