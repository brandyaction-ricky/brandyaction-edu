'use client';
import {studentReportingAvailable} from '../student-reporting';
import {useEffect,useRef,useState} from 'react';
import {StudentConnections} from '../student-connections';
import {BotOfficeModel,normalizeTelegramBot,type BotDocument,type BotProfile} from '@/public/campus/world/office/bot-profile.mjs';
import {parseEmployeeLines,pickSeat} from './bulk';
import {useCampusDraftGuard} from '../../ui/draft-guard';
import {campusActivity} from '../../analytics/client';
import {useDirectory} from './directory';
import styles from './panel.module.css';
type Saved={document:BotDocument;revision:string|null;updated_at:string|null};
export function PersonalOffice({enrollmentId,demo=false,onChange,onJobs}:{enrollmentId:string;demo?:boolean;onChange?:(document:BotDocument)=>void;onJobs?:(employee:{id:string;name:string})=>void}){
 const [pilot,setPilot]=useState(false);
 const [loaded,setLoaded]=useState(demo);
 const [saved,setSaved]=useState<Saved>({document:new BotOfficeModel().getDocument(),revision:null,updated_at:null}),[loading,setLoading]=useState(!demo),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[name,setName]=useState(''),[telegram,setTelegram]=useState(''),[duties,setDuties]=useState(''),[bulk,setBulk]=useState('');const locked=useRef(false),notice=useRef<HTMLParagraphElement>(null),onChangeRef=useRef(onChange);useEffect(()=>{onChangeRef.current=onChange;},[onChange]);
 const [statusFirst,setStatusFirst]=useState<boolean|null>(demo?false:null);
 const [epoch,setEpoch]=useState(0),[gone,setGone]=useState(0),[local,setLocal]=useState<BotProfile[]>([]);
 const dir=useDirectory(enrollmentId,!demo,epoch);
 const desks=saved.document.profiles.filter(p=>p.employeeId!=='manager');
 // 자리에 앉은 순서대로(총괄 관리자 자리부터), 앉지 않은 직원은 이름순으로 뒤에.
 const seatOrder=(p:BotProfile)=>desks.find(d=>d.employeeId===p.employeeId)?.seatIndex??99;
 const employees=[...(demo?local:(dir.data?.employees??[]))].sort((a,b)=>seatOrder(a)-seatOrder(b)||a.name.localeCompare(b.name,'ko'));
 function changed(){setEpoch(v=>v+1);}
 useCampusDraftGuard(!!(name||telegram||duties||bulk),busy,'personal-office');
 async function refresh(signal?:AbortSignal){if(demo)return;const r=await fetch('/api/campus/office/agents?enrollmentId='+enrollmentId,{cache:'no-store',signal});const data=await r.json();if(!r.ok)throw Error(data.error||'내 직원을 불러오지 못했어요.');setPilot(data.pilot===true);setSaved(data);setStatusFirst(v=>v??data.document.profiles.some((p:BotProfile)=>p.employeeId!=='manager'));setLoaded(true);onChangeRef.current?.(data.document);}
 useEffect(()=>{const c=new AbortController();void Promise.resolve().then(()=>refresh(c.signal)).catch(e=>{if(e.name!=='AbortError')setMessage(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[enrollmentId,demo]); // eslint-disable-line react-hooks/exhaustive-deps
 async function save(document:BotDocument){if(locked.current||!loaded)return false;locked.current=true;setBusy(true);setMessage('');try{
  const clean=new BotOfficeModel().restore(document);let data:Saved;
  if(demo){data={document:clean,revision:crypto.randomUUID(),updated_at:new Date().toISOString()};}
  else{const r=await fetch('/api/campus/office/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollmentId,document:clean,revision:crypto.randomUUID(),expectedRevision:saved.revision})});data=await r.json();if(!r.ok)throw Error((data as unknown as {error:string}).error||'저장하지 못했어요.');}
  setSaved(data);changed();if(demo)setLocal(old=>[...new Map([...old,...clean.profiles.filter(p=>p.employeeId!=='manager')].map(p=>[p.employeeId,p])).values()]);onChangeRef.current?.(clean);window.dispatchEvent(new CustomEvent('campus:office-saved',{detail:clean}));campusActivity('bot_save');setMessage(demo?'미리보기에 배치했어요.':'내 계정에 직원을 저장했어요.');setName('');setTelegram('');setDuties('');return true;
 }catch(e){setMessage((e as Error).message);return false;}finally{locked.current=false;setBusy(false);}}
 async function register(v:{name:string;telegram:string;duties:string},known:BotProfile[]):Promise<BotProfile>{
  if(demo){const p=new BotOfficeModel().saveEmployee({name:v.name,telegramInput:v.telegram,duties:v.duties}).profiles[0];if(known.some(k=>k.telegramUrl===p.telegramUrl))throw Error('이미 등록한 봇입니다.');return p;}
  const r=await fetch('/api/campus/office/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',enrollmentId,name:v.name,telegram:v.telegram,duties:v.duties})});const d=await r.json();if(!r.ok)throw Error(d.error||'등록하지 못했어요.');return d.employee;
 }
 async function add(){
  if(locked.current)return;locked.current=true;setBusy(true);setMessage('');
  try{const p=await register({name,telegram,duties},local);if(demo)setLocal([...local,p]);
   setName('');setTelegram('');setDuties('');dir.first();changed();setMessage('직원을 등록했어요. 아래 ‘전체 직원 목록’에서 ‘빈자리에 배치’를 누르면 사무실 자리에 앉아요.');
  }catch(e){setMessage((e as Error).message);}finally{locked.current=false;setBusy(false);}
 }
 // 여러 명을 한 번에 등록하고 빈자리에 앉힌다. 이미 등록한 봇은 등록을 건너뛰고 자리만 잡는다.
 async function addMany(){
  const rows=parseEmployeeLines(bulk);if(locked.current||!loaded||!rows.length)return;
  if(rows.length>10){setMessage('한 번에 10명까지 등록할 수 있어요.');return;}
  locked.current=true;setBusy(true);setMessage('');
  const lines=bulk.split(/\r?\n/),fresh:BotProfile[]=[],failed:string[]=[],keep:string[]=[],document=structuredClone(saved.document);let seated=0;
  try{for(const row of rows){let p:BotProfile|undefined;
    try{p=await register(row,[...local,...fresh]);fresh.push(p);}
    catch(e){let url='';try{url=normalizeTelegramBot(row.telegram);}catch{}
     p=[...employees,...fresh].find(k=>k.telegramUrl===url);
     if(!p){failed.push(row.line+'번째 줄 '+(e as Error).message);keep.push(lines[row.line-1]);continue;}}
    const id=p.employeeId;if(document.profiles.some(d=>d.employeeId===id))continue;
    const seat=pickSeat(p.name,document.profiles.map(d=>d.seatIndex));
    if(seat!==undefined){document.profiles.push({...p,seatIndex:seat});seated++;}
  }}finally{locked.current=false;setBusy(false);}
  if(demo&&fresh.length)setLocal(old=>[...old,...fresh]);
  const placed=!seated||await save(document);dir.first();changed();setBulk(keep.join('\n'));
  setMessage((placed?fresh.length+'명을 등록하고 '+seated+'명을 자리에 앉혔어요.':fresh.length+'명을 등록했지만 자리 배치는 저장하지 못했어요. 전체 직원 목록에서 "빈자리에 배치"를 눌러 주세요.')+(failed.length?' 확인이 필요한 줄: '+failed.join(' / '):''));
  // 결과 안내는 화면 맨 위에 있어서, 아래쪽 입력칸에서 눌렀을 때도 보이도록 올려 준다.
  requestAnimationFrame(()=>notice.current?.scrollIntoView({block:'center',behavior:'smooth'}));
 }
 // 잘못 등록한 직원 삭제. 자리에 앉아 있으면 자리부터 비운다(자리 문서가 직원을 다시 만들기 때문).
 async function remove(p:BotProfile){
  if(!window.confirm('‘'+p.name+'’을(를) 직원 목록에서 삭제할까요?\n보고 연결이 끊기고, 이미 받은 업무 기록은 작업함에 남아요.'))return;
  if(desks.some(d=>d.employeeId===p.employeeId)&&!await save({...saved.document,profiles:saved.document.profiles.filter(d=>d.employeeId!==p.employeeId)}))return;
  if(locked.current)return;locked.current=true;setBusy(true);setMessage('');
  try{if(demo)setLocal(old=>old.filter(v=>v.employeeId!==p.employeeId));
   else{const r=await fetch('/api/campus/office/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'remove',enrollmentId,employeeId:p.employeeId})});const d=await r.json();if(!r.ok)throw Error(d.error||'삭제하지 못했어요.');}
   dir.first();changed();setGone(v=>v+1);setMessage('‘'+p.name+'’을(를) 직원 목록에서 삭제했어요.');
  }catch(e){setMessage((e as Error).message);}finally{locked.current=false;setBusy(false);}
 }
 function place(p:BotProfile){
  // The lead desk (0) is offered last so it stays free for the 총괄 employee.
  const seat=[1,2,3,4,5,6,7,8,9,0].find(n=>!desks.some(d=>d.seatIndex===n));
  if(seat!==undefined)seatAt(p,seat);
 }
 function seatAt(p:BotProfile,seat:number){
  const document=structuredClone(saved.document);document.profiles.push({...p,seatIndex:seat});void save(document);
 }
 function unseat(p:BotProfile){void save({...saved.document,profiles:saved.document.profiles.filter(d=>d.employeeId!==p.employeeId)});}
 async function importFile(file:File){try{if(file.size>18000)throw Error('직원 목록 JSON 파일은 18KB 이내로 넣어 주세요.');const raw=JSON.parse(await file.text()),model=new BotOfficeModel();await save(model.restore(raw.botOffice||raw));}catch{setMessage('윤익님 사무실에서 내보낸 직원 목록 JSON 파일을 확인해 주세요. 봇 토큰은 넣지 마세요.');}}
 // 들어왔을 때 이미 자리에 앉은 직원이 있으면 현황(자리·목록·연결)을 먼저, 처음이면 등록 칸을 먼저 보여 준다.
 // 화면을 쓰는 도중에는 순서를 바꾸지 않는다(방금 쓰던 등록 칸이 다른 곳으로 옮겨 가지 않게).
 const addForms=<>
 <form onSubmit={e=>{e.preventDefault();add();}}><h3>직원 추가</h3><label>직원 이름<input required maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="예: 콘텐츠 기획 담당"/></label><label>텔레그램 봇 주소<input required value={telegram} maxLength={200} onChange={e=>setTelegram(e.target.value)} placeholder="https://t.me/my_marketing_bot"/></label><label>담당 업무<textarea maxLength={500} value={duties} onChange={e=>setDuties(e.target.value)} placeholder="예: 이번 주 콘텐츠 아이디어 정리"/></label><button className={styles.primary} disabled={busy}>{busy?'저장 중…':'직원 등록하기'}</button></form>
 <details><summary>여러 명 한 번에 등록</summary><p>한 줄에 한 명씩 <strong>이름, 봇 주소, 담당 업무</strong> 순서로 적어 주세요. 담당 업무는 비워도 돼요. 등록한 직원은 빈자리에 바로 앉고, 이름이 &lsquo;총괄&rsquo;로 시작하는 직원은 총괄 관리자 자리에 앉아요. 이미 등록한 봇은 이름과 담당 업무를 그대로 두고 자리만 잡아요.</p><label>직원 목록 (최대 10명)<textarea rows={10} maxLength={8000} value={bulk} onChange={e=>setBulk(e.target.value)} placeholder={'제 2의 뇌, @my_brain_bot, 자료 정리와 기억\nGEO 담당자, https://t.me/my_geo_bot, AI 검색 노출 점검'}/></label><button type="button" className={styles.primary} disabled={busy||!bulk.trim()} onClick={()=>void addMany()}>{busy?'등록 중…':'한 번에 등록하고 자리에 앉히기'}</button></details>
 </>;
 const links=!demo&&(pilot || studentReportingAvailable()) && <StudentConnections key={enrollmentId+':'+gone} enrollmentId={enrollmentId} employees={employees} onJobs={onJobs}/>;
 const seatBoard=<>
 <section aria-label="사무실 좌석"><h3>사무실 좌석 <small>{desks.length} / 10</small></h3>
 <p>총괄 관리자 자리는 29일차에 채용하는 총괄 관리자의 자리예요. 자리를 비워도 직원의 보고 연결과 업무 기록은 그대로 남아요.</p>
 <ol className={styles.seats}>{[0,1,2,3,4,5,6,7,8,9].map(n=>{const p=desks.find(d=>d.seatIndex===n),free=employees.filter(e=>!desks.some(d=>d.employeeId===e.employeeId));return <li key={n} data-empty={p?undefined:''} data-lead={n?undefined:''}><small>{n?n+'번 자리':'총괄 관리자 자리'}</small><strong>{p?.name||'빈자리'}</strong>{p?<button type="button" disabled={busy} onClick={()=>unseat(p)}>자리 비우기</button>:!n&&free.length>0&&<select aria-label="총괄 관리자 자리에 앉힐 직원" value="" disabled={busy} onChange={e=>{const chosen=free.find(f=>f.employeeId===e.target.value);if(chosen)seatAt(chosen,0);}}><option value="">직원 선택</option>{free.map(f=><option key={f.employeeId} value={f.employeeId}>{f.name}</option>)}</select>}</li>;})}</ol></section>
 </>;
 const roster=<>
 <h3>전체 직원 목록</h3>{dir.error&&<p role="alert">{dir.error}</p>}
 <div className={styles.roster}>{employees.map(p=>{const seat=desks.find(d=>d.employeeId===p.employeeId);return <article key={p.employeeId}><div><strong>{p.name}</strong><span>{seat?(seat.seatIndex?seat.seatIndex+'번 자리':'총괄 관리자 자리'):'미배치'}</span></div>{p.duties&&<p>{p.duties}</p>}<div className={styles.controls}>
 {onJobs&&!demo&&<button type="button" onClick={()=>onJobs({id:p.employeeId,name:p.name})}>업무·결과 보기</button>}
 {!seat&&<button type="button" disabled={busy||desks.length>=10} onClick={()=>place(p)}>빈자리에 배치</button>}
 {p.telegramUrl&&<a href={p.telegramUrl} target="_blank" rel="noopener noreferrer">텔레그램 열기 ↗</a>}
 <button type="button" className={styles.danger} disabled={busy} onClick={()=>void remove(p)}>직원 삭제</button></div></article>;})}</div>
 {!demo&&(dir.page>1||!!dir.data?.next)&&<><div className={styles.controls}><button disabled={dir.page===1} onClick={dir.prev}>이전 직원 목록</button><span>{dir.page}페이지</span><button disabled={!dir.data?.next} onClick={dir.next}>다음 직원 목록</button></div>
</>}
 </>;
 return <section className={styles.office}><header><small>내가 만든 AI 직원들이 모이는 곳</small><h2>내 AI 직원</h2><p>수업에서 만든 텔레그램 봇을 등록한 뒤 보고를 연결하면, 직원별 업무와 결과를 확인할 수 있어요.</p></header>{message&&<p ref={notice} role="status" className={styles.notice}>{message}</p>}{loading?<p role="status">내 직원을 불러오고 있어요…</p>:!loaded?<div><p>저장된 직원을 확인한 뒤 편집할 수 있어요.</p><button onClick={()=>void refresh().catch(e=>setMessage(e.message))}>내 직원 다시 불러오기</button></div>:<>
 {statusFirst?<>{seatBoard}{roster}{links}{addForms}</>:<>{addForms}{links}{seatBoard}{roster}</>}

 {demo&&<details><summary>기존 사무실 직원 목록 가져오기</summary><p>윤익님 프로그램의 직원 목록 JSON을 가져오면 같은 외형과 좌석으로 배치됩니다. 좌석 배치만 교체하며, 기존 직원과 기록은 유지합니다.</p><label>직원 목록 JSON<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value='';}}/></label></details>}
 <footer><span>자리 {desks.length}/10 · {demo?'미리보기':saved.updated_at?'계정에 저장됨':'아직 저장 전'}</span><button disabled={busy||demo} onClick={()=>void refresh().then(changed).catch(e=>setMessage(e.message))}>다른 기기의 변경 불러오기</button></footer><p className={styles.note}>연결한 직원의 업무와 결과는 자리 배치와 관계없이 작업함에서 확인할 수 있어요. 봇 비밀키를 입력할 필요는 없습니다.</p></>}</section>;
}
