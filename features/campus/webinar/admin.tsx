'use client';
import Link from 'next/link';
import {ArrowUpRight,ChartNoAxesCombined,Eye,Home,Plus,Save,Link2,Settings,Layers,Trash2,RefreshCw} from 'lucide-react';
import {RoomContentEditor} from '../content/editor';
import {rooms,type TourRoom} from '../tour/model';
import {WelcomeEditor} from '../welcome/editor';
import {validateWebinar} from './domain';
import {useCampusDraftGuard} from '../ui/draft-guard';
import {AdminPageHeader} from '@/features/admin-ui/components/admin-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Webinar, type WebinarEvent, eventNames } from './domain';
import styles from './admin.module.css';
import {ResourceEditor} from './resource-library';
import {CampusEntryLinks} from './entry-links';
type Cohort={id:string;name:string;course_id:string;courses:{title:string;slug:string}|{title:string;slug:string}[]};
const labels:Record<WebinarEvent,string>={entry:'입장',experience:'체험존 열기',gate:'전용 공간 관심',detail:'상세 페이지 클릭',consult:'상담 클릭',checkout:'수강 신청 클릭'};
function blank():Webinar{return {slug:'',title:'문샷 오픈 캠퍼스',description:'AI로 내 일의 다음 도약을 준비하세요.',status:'draft',startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),cohortId:'',detailPath:'',kakaoUrl:'',youtubeId:'',revision:crypto.randomUUID()};}
function localTime(value:string){const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
const noCohorts:Cohort[]=[];
const statusLabel = {draft:'작성 중', published:'공개', paused:'입장 중지'};
export function WebinarAdmin({demo=false,demoCohorts=noCohorts,studyPreview=false}:{demo?:boolean;demoCohorts?:Cohort[];studyPreview?:boolean}){
 const [tab,setTab]=useState('links');
 const [events,setEvents]=useState<Webinar[]>([]),[cohorts,setCohorts]=useState<Cohort[]>([]),[form,setForm]=useState<Webinar|null>(null),[expected,setExpected]=useState<string|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stats,setStats]=useState<{counts:Record<WebinarEvent,number>;trackingEnabled:boolean}|null>(null),[statsBusy,setStatsBusy]=useState(false);
 useCampusDraftGuard(!!form&&JSON.stringify(form)!==JSON.stringify(events.find(e=>e.slug===form.slug)),busy);
 const editorHeading=useRef<HTMLHeadingElement>(null), titleInput=useRef<HTMLInputElement>(null);
 const request=useRef(false),ticket=useRef(0),errorBox=useRef<HTMLParagraphElement>(null),focusError=useRef(false);
 function showError(message:string){focusError.current=true;setError(message);}
 useEffect(()=>{if(error&&focusError.current){focusError.current=false;errorBox.current?.focus();errorBox.current?.scrollIntoView({block:'center'});}},[error]);
 const load=useCallback(async()=>{if(demo){setCohorts(demoCohorts);try{setEvents(JSON.parse(localStorage.getItem('moonshot-tour-webinars')||'[]'));}catch{showError('브라우저의 예시 설정을 읽지 못했어요.');}return;}if(request.current)return;request.current=true;setBusy(true);setNotice('');setError('');try{const r=await fetch('/api/admin/campus/webinars',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setEvents(d.events);setCohorts(d.cohorts);if(d.moreEvents)setNotice('최근 행사 100개를 표시합니다.');}catch(e){showError((e as Error).message||'목록을 불러오지 못했어요. 다시 시도해 주세요.');}finally{setBusy(false);request.current=false;}},[demo,demoCohorts]);
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>{if(active)void load();});return()=>{active=false;};},[load]);
 function edit(w:Webinar){if(form&&JSON.stringify(form)!==JSON.stringify(events.find(e=>e.slug===form.slug))&&!window.confirm('저장하지 않은 내용을 버리고 다른 행사를 열까요?'))return;const creating=!w.slug;
   const draft=creating ? {...w,slug:'campus-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8)} : {...w};
   setTab(creating?'settings':'links');ticket.current++;setForm(draft);setExpected(creating?null:w.revision);
   requestAnimationFrame(()=>{if(creating){titleInput.current?.focus();titleInput.current?.select();}else editorHeading.current?.focus();});setStats(null);setStatsBusy(false);setNotice('');setError('');}
 async function save(){if(!form||request.current)return;request.current=true;setBusy(true);setNotice('');setError('');try{const saved=validateWebinar({...form,revision:crypto.randomUUID()});if(demo){const next=[saved,...events.filter(x=>x.slug!==saved.slug)];localStorage.setItem('moonshot-tour-webinars',JSON.stringify(next));setForm(saved);setExpected(saved.revision);setEvents(next);setNotice('이 브라우저에 예시 설정을 저장했어요. 실제 입장 링크는 공개되지 않습니다.');return;}const r=await fetch('/api/admin/campus/webinars',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:saved,expectedRevision:expected})}),d=await r.json();if(!r.ok)throw Error(d.error);setForm(d.event);setExpected(d.event.revision);setEvents(old=>[d.event,...old.filter(x=>x.slug!==d.event.slug)]);setNotice('저장했습니다. 공개 상태의 행사만 링크로 입장할 수 있습니다.');}catch(e){showError((e as Error).message||'설정을 저장하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.');}finally{setBusy(false);request.current=false;}}

 async function removeEvent(event: Webinar) {
   if (request.current) return;
   const selected = expected !== null && form?.slug === event.slug;
   const changed = selected && JSON.stringify(form) !== JSON.stringify(event);
   const details = event.status === 'published' ? '공개 입장 링크가 닫힙니다.' : '관리 목록에서 사라집니다.';
   if (!window.confirm(`‘${event.title}’ 행사를 삭제할까요?
${event.slug}
${details}${changed ? ' 저장하지 않은 수정 사항도 사라집니다.' : ''}`)) return;
   request.current = true; setBusy(true); setError(''); setNotice('');
   try {
     if (demo) {
       const next = events.filter(item => item.slug !== event.slug);
       localStorage.setItem('moonshot-tour-webinars', JSON.stringify(next));
     } else {
       const response = await fetch('/api/admin/campus/webinars', {
         method:'DELETE', headers:{'Content-Type':'application/json'},
         body:JSON.stringify({slug:event.slug, expectedRevision:event.revision}),
       });
       if (!response.ok) throw Error((await response.json()).error);
     }
     if (selected) {
       ticket.current++; setForm(null); setExpected(null); setStats(null); setStatsBusy(false);
     }
     setEvents(items => items.filter(item => item.slug !== event.slug));
     setNotice(`‘${event.title}’ 행사를 삭제했습니다.`);
   } catch (err) {
     showError((err as Error).message || '행사를 삭제하지 못했습니다. 목록을 새로고침해 주세요.');
   } finally { request.current = false; setBusy(false); }
 }
 async function metrics(){if(demo){setNotice('실제 방문 기록은 DEV에서 확인합니다. 예시 수치를 만들지 않습니다.');return;}if(!form||statsBusy)return;const n=++ticket.current;setStatsBusy(true);setNotice('');setError('');try{const r=await fetch('/api/admin/campus/webinars?slug='+form.slug,{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);if(n===ticket.current)setStats(d);}catch(e){if(n===ticket.current)showError((e as Error).message||'집계를 불러오지 못했어요. 다시 시도해 주세요.');}finally{if(n===ticket.current)setStatsBusy(false);}}
 function patch<K extends keyof Webinar>(key:K,value:Webinar[K]){setForm(f=>f?{...f,[key]:value}:f);}
 return <main className={`edu-admin adm admin-standalone ${styles.page}`}><nav className={styles.breadcrumb}><Link href="/admin"><Home size={16}/> 관리자 홈</Link><span>/</span><span>문샷 캠퍼스</span></nav><AdminPageHeader className={styles.pageHeader} title="문샷 캠퍼스 관리" description="입장 링크부터 공간 콘텐츠까지, 한곳에서 관리하세요." actions={<button className={`btn primary ${styles.newButton}`} disabled={busy} onClick={()=>edit(blank())}><Plus size={18}/> 새 행사 만들기</button>}/><nav className={styles.quickLinks} aria-label="캠퍼스 바로가기"><Link href="/admin/campus/events"><Layers size={24}/><div><strong>당첨자 이벤트 존</strong><span>전용 자료·초대 링크·중복 쿠폰 관리</span></div><ArrowUpRight size={18}/></Link><a aria-label="관리자 전용 공간 미리보기 ↗" href={"/admin/campus/preview"+(expected&&form?.slug?"?slug="+encodeURIComponent(form.slug):"")} target="_blank" rel="noopener noreferrer"><Eye size={24}/><div><strong>공간 미리보기</strong><span>참여자가 보는 화면 확인</span></div><ArrowUpRight size={18}/></a>{studyPreview && <Link href="/admin/campus/study"><Layers size={24}/><div><strong>기수별 캠퍼스 수업</strong><span>수업 미리보기와 수강 방식 설정</span></div><ArrowUpRight size={18}/></Link>}<Link href="/admin/analytics"><ChartNoAxesCombined size={24}/><div><strong>공간별 데이터 분석</strong><span>클릭·체류·전환 흐름 확인</span></div><ArrowUpRight size={18}/></Link></nav><p role="status" className={notice?styles.savedNotice:undefined}>{notice}</p>{error&&!form&&<p ref={errorBox} tabIndex={-1} role="alert" className={styles.errorNotice}>{error}</p>}<div className={styles.layout}><aside className={styles.eventPanel} aria-label="행사 선택">
  <div className={styles.listHeading}><h2>관리할 행사</h2><button type="button" className={styles.refresh} aria-label="목록 새로고침" title="목록 새로고침" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/></button></div>
  <ul className={styles.eventList}>{events.map(w=><li key={w.slug} data-selected={expected!==null && form?.slug===w.slug}>
    <button type="button" className={styles.eventPick} aria-pressed={expected!==null && form?.slug===w.slug} disabled={busy} onClick={()=>edit(w)}>
      <span className={styles.eventStatus} data-status={w.status}>{statusLabel[w.status]}</span>
      <strong>{w.title}</strong><small>{w.slug}</small>
    </button>
    <button type="button" className={styles.removeEvent} disabled={busy} onClick={()=>void removeEvent(w)} aria-label={w.title+' 삭제 · '+w.slug} title="행사 삭제"><Trash2 size={16}/></button>
  </li>)}</ul>
  {!busy&&!events.length&&<p>등록된 행사가 없습니다.</p>}
 </aside>{form?<section><div className={styles.selectedHeader}><div><small>{expected ? '선택한 행사' : '새 행사'}</small><h2 ref={editorHeading} tabIndex={-1}>{form.title}</h2></div><span className={styles.statusBadge}>{form.status==='published'?'공개 중':form.status==='paused'?'입장 중지':'작성 중'}</span></div><nav className={styles.sectionTabs} aria-label="관리 항목">{[['links','입장 링크'],...rooms.map(r=>[r.id,r.name]),['settings','행사 설정']].map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{id==='links'?<Link2 size={16}/>:id==='settings'?<Settings size={16}/>:<Layers size={16}/>} {label}</button>)}</nav>{tab==='links'&&<CampusEntryLinks cohortId={form.cohortId} slug={form.slug} published={events.some(e=>e.slug===form.slug&&e.status==='published')} saved={expected!==null}/>}<form noValidate onInvalidCapture={e=>{const input=e.target as HTMLInputElement;setError(input.validationMessage||'필수 항목과 입력 형식을 확인해 주세요.');}} onSubmit={e=>{e.preventDefault();void save();}}>{tab==='settings'&&<><h2>행사 설정</h2><div className={styles.grid}><label>행사 주소<input required disabled={busy||expected!==null} pattern="[a-z0-9][a-z0-9-]{2,59}" value={form.slug} placeholder="moonshot-open-1107" onChange={e=>patch('slug',e.target.value)}/><small>/campus/live/{form.slug||'행사-주소'}</small></label><label>공개 상태<select disabled={busy} value={form.status} onChange={e=>patch('status',e.target.value as Webinar['status'])}><option value="draft">작성 중 · 입장 불가</option><option value="published">공개 · 링크 입장 가능</option><option value="paused">입장 중지</option></select></label><label>제목<input ref={titleInput} required maxLength={100} disabled={busy} value={form.title} onChange={e=>patch('title',e.target.value)}/></label><label>연결할 교육 기수<select required disabled={busy} value={form.cohortId} onChange={e=>{const c=cohorts.find(c=>c.id===e.target.value),course=Array.isArray(c?.courses)?c.courses[0]:c?.courses;setForm({...form,cohortId:e.target.value,detailPath:course?.slug?'/classes/'+course.slug:''});}}><option value="">기수를 선택하세요</option>{cohorts.map(c=><option key={c.id} value={c.id}>{(Array.isArray(c.courses)?c.courses[0]:c.courses)?.title} · {c.name}</option>)}</select><small>수강 신청과 구매자 입장 확인에 사용할 기수입니다.</small></label><label>웨비나 시작 시간<input type="datetime-local" required disabled={busy} value={localTime(form.startsAt)} onChange={e=>{if(e.target.value)patch('startsAt',new Date(e.target.value).toISOString());}}/></label><label>웨비나 종료 시간<input type="datetime-local" required disabled={busy} value={localTime(form.endsAt)} onChange={e=>{if(e.target.value)patch('endsAt',new Date(e.target.value).toISOString());}}/></label></div><p>일정은 현재 기기의 시간대로 표시됩니다. 행사가 끝나도 캠퍼스는 자동으로 닫히지 않습니다. 방문자 입장을 멈추려면 공개 상태를 ‘입장 중지’로 바꿔 주세요. 수강생은 행사 일정과 관계없이 본인의 수강권으로 캠퍼스를 이용합니다.</p><label>한 줄 소개<textarea maxLength={600} disabled={busy} value={form.description} onChange={e=>patch('description',e.target.value)}/></label><div className={styles.grid}><label>클래스 상세 페이지<input readOnly value={form.detailPath}/></label><label>카카오 채널 상담 주소<input disabled={busy} value={form.kakaoUrl} placeholder="https://pf.kakao.com/채널/chat" onChange={e=>patch('kakaoUrl',e.target.value)}/></label><label>유튜브 라이브 영상 ID<input disabled={busy} maxLength={11} value={form.youtubeId} placeholder="영상 주소의 11자리 ID" onChange={e=>patch('youtubeId',e.target.value)}/><small>방문자가 재생을 누를 때 연결합니다.</small></label></div><label>공간 분위기 · 안내 캐릭터<select disabled={busy} value={form.ambientCount??40} onChange={e=>patch('ambientCount',Number(e.target.value))}><option value={0}>끄기</option><option value={20}>20명 · 여유롭게</option><option value={40}>40명 · 활기차게</option><option value={60}>60명 · 북적이게</option></select><small>실제 접속 수에 포함하지 않는 안내 캐릭터입니다. 휴대폰은 최대 40명을 표시하며 실제 참여자를 먼저 보여줍니다.</small></label></>}{rooms.some(r=>r.id===tab)&&<details className={styles.roomSettings} open={tab!=='welcome'&&tab!=='library'}><summary>공간 카드·소개·게시글 편집</summary><RoomContentEditor key={tab+form.slug} room={tab as TourRoom} value={form.content?.[tab as TourRoom]} disabled={busy} onBusy={value=>{request.current=value;setBusy(value);}} onChange={value=>patch('content',{...form.content,[tab]:value})}/></details>} {tab==='welcome'&&<WelcomeEditor cohortId={form.cohortId} onBusy={value=>{request.current=value;setBusy(value);}} value={form.welcome} disabled={busy} onChange={value=>patch('welcome',value)}/>} {tab==='library'&&<ResourceEditor slug={!demo&&expected?form.slug:undefined} onBusy={value=>{request.current=value;setBusy(value);}} items={form.resources||[]} disabled={busy} onChange={items=>patch('resources',items)}/>}<div>{error&&<p ref={errorBox} tabIndex={-1} role="alert" className={styles.errorNotice}>{error}</p>}</div><div className={styles.saveBar}><span>{JSON.stringify(form)===JSON.stringify(events.find(e=>e.slug===form.slug))?'저장된 설정입니다':'변경사항이 있습니다'}</span><button className="btn primary" type="submit" disabled={busy}><Save size={17}/>{busy?'처리 중…':'설정 저장'}</button>{expected&&form.status==='published'&&<a href={'/campus/live/'+form.slug} target="_blank" rel="noopener noreferrer">공개 입장 화면 열기 ↗</a>}</div></form>{expected&&tab==='links'&&<section className={styles.stats}><div className={styles.actions}><h2>최근 30일 행동 집계</h2><button disabled={statsBusy} onClick={()=>void metrics()}>{statsBusy?'조회 중…':'집계 새로고침'}</button></div><p>이벤트 횟수이며, 동시 접속 인원·고유 방문자·결제 완료 수가 아닙니다. 새 탭·재방문은 중복될 수 있고, 빠른 연속 행동은 중복 방지로 일부 제외됩니다.</p>{stats&&<><p>{stats.trackingEnabled?'현재 사이트 방문 기록 수집 켜짐':'현재 사이트 방문 기록 수집 꺼짐 · 새 이벤트가 저장되지 않습니다.'}</p><div className={styles.metrics}>{eventNames.map(n=><div key={n}><span>{labels[n]}</span><strong>{stats.counts[n].toLocaleString()}</strong></div>)}</div></>}</section>}</section>:<section className={styles.emptyState}><Layers size={32} aria-hidden="true"/><h2>관리할 행사를 선택하세요.</h2><p>행사 목록에서 기존 행사를 선택하거나<br/>상단의 ‘새 행사 만들기’로 시작하세요.</p><small>작성 중에는 공개 링크로 접속할 수 없습니다.<br/>공개해도 수강생 공간의 권한은 바뀌지 않습니다.</small></section>}</div></main>;
}
