'use client';
import type {CampusResource} from '../webinar/resources';
import {useEffect,useRef,useState} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {CampusFrame} from '../ui/dashboard';
import type {CampusSnapshot} from '../contracts';
import {createEduBridge,type EduBridge,type BridgeState} from '@/public/campus/edu-bridge.mjs';
import {withCampusReturn,requestedEnrollment} from '../ui/navigation';
import {tourAvatar,type TourAvatar} from './appearance';
import {campusDraftState} from '../ui/draft-guard';
import type {SpaceState} from '../space/domain';
const Campus=dynamic(()=>import('./preview').then(m=>m.FourSpacesPreview),{loading:()=> <p role="status">문샷 공간을 준비하고 있어요.</p>});
export function FourSpacesLive({operator=false,publicPresence=false}:{operator?:boolean;publicPresence?:boolean}){
 const [state,setState]=useState<BridgeState>({status:'loading',snapshot:null}),[error,setError]=useState('');
 const bridge=useRef<EduBridge|null>(null),selected=useRef<string|null>(null);
 useEffect(()=>{const b=createEduBridge({onState:next=>setState(old=>next.status==='loading'&&old.status==='ready'?old:next),navigate:href=>window.location.assign(withCampusReturn(href,location.pathname+location.search))});bridge.current=b;
 selected.current=requestedEnrollment(location.search);let disposed=false;void b.load(selected.current).then(data=>{if(!disposed&&!selected.current&&data.scopes[0]){selected.current=data.scopes[0].enrollmentId;const u=new URL(location.href);u.searchParams.set('enrollmentId',selected.current);history.replaceState(history.state,'',u);return b.load(selected.current);}}).catch(()=>{});
 const refresh=()=>{if(!document.hidden&&!campusDraftState().dirty&&!campusDraftState().locked&&selected.current)void b.load(selected.current).catch(()=>{});};const timer=setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);
 return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);b.dispose();bridge.current=null;};},[]);
 function run(p:Promise<unknown>|undefined){setError('');p?.catch(e=>{if(e.name!=='AbortError')setError(e.message);});}
 if(state.status!=='ready')return <CampusFrame><h1>문샷 캠퍼스</h1><p role={state.status==='error'?'alert':'status'}>{state.status==='error'?state.message:'수강권과 공개 수업을 확인하고 있어요.'}</p>{state.status==='error'&&<button onClick={()=>run(bridge.current?.load(selected.current))}>다시 확인</button>}<Link href="/my/classes">내 클래스</Link></CampusFrame>;
 const snapshot=state.snapshot as CampusSnapshot;
 if(!snapshot.selectedEnrollmentId)return <CampusFrame><h1>이용 가능한 수강권을 선택해 주세요</h1><Link href="/campus/enter">캠퍼스 입장 안내</Link>{operator&&<p><Link href="/admin/campus/webinars">관리자 입장 링크 관리</Link> · <Link href="/admin/campus/operations">기수 운영 현황</Link></p>}</CampusFrame>;
 return <ConnectedCampus key={snapshot.viewer.id+snapshot.selectedEnrollmentId} snapshot={snapshot} operator={operator} publicPresence={publicPresence} error={error} onOpen={(lesson,mission)=>run(mission?bridge.current?.openMission(selected.current!,lesson,mission):bridge.current?.openLesson(selected.current!,lesson))} onRefresh={()=>run(bridge.current?.load(selected.current))} onSelect={id=>{selected.current=id;const u=new URL(location.href);u.searchParams.set('enrollmentId',id);history.replaceState(history.state,'',u);run(bridge.current?.load(id));}}/>;
}
function ConnectedCampus({snapshot,operator,publicPresence,error,onOpen,onRefresh,onSelect}:{snapshot:CampusSnapshot;operator:boolean;publicPresence:boolean;error:string;onOpen:(id:string,mission?:string)=>void;onRefresh:()=>void;onSelect:(id:string)=>void}){
 const [libraryResources,setLibraryResources]=useState<CampusResource[]>([]),[libraryError,setLibraryError]=useState('');

 const [avatar,setAvatar]=useState<TourAvatar|null>(null),[failure,setFailure]=useState(''),[denied,setDenied]=useState(false),[revision,setRevision]=useState(0),[level,setLevel]=useState<number|null>(null);
 useEffect(()=>{const controller=new AbortController();void fetch('/api/campus/library?enrollmentId='+snapshot.selectedEnrollmentId,{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'자료실을 불러오지 못했어요.');setLibraryResources(d.resources);setLibraryError('');}).catch(e=>{if(e.name!=='AbortError')setLibraryError(e.message);});return()=>controller.abort();},[snapshot.selectedEnrollmentId,revision]);
 const cohort=snapshot.scopes.find(s=>s.enrollmentId===snapshot.selectedEnrollmentId)!.cohortId,writing=useRef(false),epoch=useRef(0),session=useRef('');
 useEffect(()=>{session.current=crypto.randomUUID();const controller=new AbortController();let stop=false;
 async function read(){if(stop||document.hidden||writing.current)return;const ticket=epoch.current;try{const r=await fetch('/api/campus/space?cohortId='+encodeURIComponent(cohort),{credentials:'same-origin',cache:'no-store',signal:controller.signal});const d=await r.json();if(!r.ok){if([401,403].includes(r.status))setDenied(true);throw Error(d.error||'캐릭터 정보를 확인하지 못했어요.');}if(!stop&&ticket===epoch.current&&!writing.current){setAvatar(tourAvatar(d.profile));setFailure('');}}catch(e){if(!stop&&(e as Error).name!=='AbortError')setFailure((e as Error).message);}}
 async function rewards(){try{const r=await fetch('/api/campus/community/rewards?enrollmentId='+snapshot.selectedEnrollmentId,{cache:'no-store',signal:controller.signal});const d=await r.json();if(!stop)setLevel(r.ok&&Number.isSafeInteger(d.level)&&d.level>0?d.level:null);}catch{}}
 void read();void rewards();const timer=setInterval(()=>void read(),30000),visible=()=>{void read();void rewards();},changed=()=>{epoch.current++;void read();};document.addEventListener('visibilitychange',visible);window.addEventListener('campus:avatar-saved',changed);window.addEventListener('campus:community-changed',rewards);
 return()=>{stop=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('campus:avatar-saved',changed);window.removeEventListener('campus:community-changed',rewards);};},[cohort,snapshot.selectedEnrollmentId,revision]);
 async function saveAvatar(value:TourAvatar){if(writing.current)throw Error('저장 중이에요. 잠시 기다려 주세요.');writing.current=true;epoch.current++;
 try{const r=await fetch('/api/campus/space?cohortId='+encodeURIComponent(cohort),{credentials:'same-origin',cache:'no-store'}),before=await r.json() as SpaceState&{error?:string};if(!r.ok){if([401,403].includes(r.status))setDenied(true);throw Error(before.error||'수강권을 확인하지 못했어요.');}
 const next={...before.profile,...tourAvatar(value)},saved=await fetch('/api/campus/space',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'profile',cohortId:cohort,sessionId:session.current,profile:next})}),data=await saved.json();if(!saved.ok){if([401,403].includes(saved.status))setDenied(true);throw Error(data.error||'저장하지 못했어요.');}const result=tourAvatar(data.profile);setAvatar(result);window.dispatchEvent(new CustomEvent('campus:avatar-saved',{detail:{cohortId:cohort,appearance:result}}));return result;
 }finally{writing.current=false;}}
 if(denied)return <CampusFrame><h1>수강권을 다시 확인해 주세요</h1><p>이 공간을 계속 이용할 수 없습니다. 내 클래스에서 현재 권한을 확인해 주세요.</p><Link href="/my/classes">내 클래스</Link></CampusFrame>;
 return <><Campus snapshot={snapshot} live={{publicPresence,libraryResources,role:operator?'admin':'student',avatar,level,saveAvatar,onOpen,onRefresh,onSelect}}/>{(error||failure||libraryError)&&<div role="alert" style={{position:'fixed',top:90,left:24,zIndex:100,background:'#fff',color:'#9f1239',padding:12,borderRadius:12}}>{error||failure||libraryError} <button onClick={()=>{setRevision(v=>v+1);onRefresh();}}>다시 확인</button></div>}</>;
}
