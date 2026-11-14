'use client';
import {EmployeeCard} from '../office/employee-card';
import {invalidateOfficeView} from '../office/shared-inbox';
import {useOfficeLive} from '../office/use-office-live';
import type {BotDocument} from '@/public/campus/world/office/bot-profile.mjs';
import {StudyLessonShortcut} from '../ui/study-lesson-shortcut';
import {LessonText} from '@/app/ui/final/lesson-text';
import {contentTasks,type CampusContent} from '../content/model';
import {assessmentKey as welcomeAssessmentKey} from '../welcome/progress';
import {AssessmentPanel} from '../welcome/assessment-panel';
import {DEFAULT_ASSESSMENT} from '../welcome/assessment';
import {WelcomePanel} from '../welcome/panel';
import {DEFAULT_WELCOME,type WelcomeSettings} from '../welcome/content';
import {OfficeFirstVisit} from '../office/first-visit';
import {PersonalOffice} from '../office/agents/panel';
import {useCampusAnalytics} from '../analytics/client';
import {CustomerQuiz} from '../webinar/customer-quiz';
import Link from 'next/link';
import {LibraryScreen} from '../webinar/library-screen';
import type {CampusResource} from '../webinar/resources';
import {ResourceLibrary} from '../webinar/resource-library';
import {lazy,Suspense,useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Map,LockKeyhole,ArrowUpRight,Maximize,Minimize,Orbit,DoorOpen,Users} from 'lucide-react';
import type {TourLiveConnection} from './live-contract';
import type {CampusSnapshot} from '../contracts';
import type {CampusAdminSnapshot} from '../admin-metrics';
import {campusDraftState} from '../ui/draft-guard';
import {MiniFocus} from '../space/mini-focus';
import {taskById,taskOpen,tourTasks} from './tasks';
import coverage from './coverage.json';
import {getCommunityDemoRewards} from '../community/events';
const FeaturePanel=lazy(()=>import('./feature-panels'));
const SpaceTools=lazy(()=>import('../space/panel').then(m=>({default:m.SpacePanel})));

import {LessonTaskPanel} from '../ui/lesson-task-panel';
import {TOUR_AVATAR_KEY,readTourAvatar,tourAvatar} from './appearance';
import {CampusWindow} from '../ui/campus-window';
import {requestedRoom} from '../ui/navigation';
import {canEnter,rooms,roleNames,type TourRole,type TourRoom} from './model';
import styles from './preview.module.css';
type Progress={video:boolean;quiz:(boolean|null)[];level:number[]};
const emptyProgress=():Progress=>({video:false,quiz:DEFAULT_ASSESSMENT.quiz.map(()=>null),level:DEFAULT_ASSESSMENT.level.map(()=>-1)});
const titles:Record<string,string>={'office-guide':'개인 사무실 이용 안내','story:study':'체험 대화 · 함께 실행하기','story:office':'체험 대화 · 내 AI 사무실','story:welcome':'체험 대화 · 첫 시작',video:'라이브 다시보기',notices:'공지사항',basics:'AI 기초 지식 배우기',quiz:'OX 퀴즈',level:'AI 수준 확인',checklist:'내 준비 현황',office:'내 AI 사무실 · 업무 관리',bots:'내 AI 직원',learning:'수업·과제',focus:'집중과 휴식',feedback:'결과물·동료 피드백','live-video':'문샷 라이브',experience:'고객 발견 체험',offer:'문샷에서 배우는 것',lesson:'예시 수업',character:'내 캐릭터'};
for(const task of tourTasks)if(!titles[task.id])titles[task.id]=task.title;
const isFeature=(id:string)=>['growth','journal','ai','office','feedback','archive','legacy-space'].includes(id)||/^(business|support|community|admin):/.test(id);
const spacePane=(id:string)=>({focus:'focus',lounge:'lounge',sound:'settings',desk:'profile'} as const)[id as 'focus'];
const EMPTY_CONTENT:CampusContent={};
const STORAGE='moonshot-four-spaces-preview-v1';
function readProgress(key=STORAGE):Progress{try{const p=JSON.parse(localStorage.getItem(key)||'null');if(p&&typeof p.video==='boolean'&&Array.isArray(p.quiz)&&p.quiz.length<=20&&p.quiz.every((v:unknown)=>v===null||typeof v==='boolean')&&Array.isArray(p.level)&&p.level.length<=12&&p.level.every((v:unknown)=>Number.isInteger(v)&&Number(v)>=-1&&Number(v)<3))return p;}catch{}return emptyProgress();}
export type TourVisitor={content?:CampusContent;analyticsScope?:string;presenceId?:string;devPresence?:boolean;qaCrowd?:boolean;ambientCount?:number;operatorReview?:boolean;operatorEvent?:string;title:string;renderGate:(room:TourRoom)=>ReactNode;renderTool:(tool:string,onPlay?:(item:CampusResource)=>void)=>ReactNode;onEnter:()=>void;onActivity:(tool:string)=>void};
type OfficeDeskJob = {id:string; name:string; jobId:string; status:'running'|'review'};
export function FourSpacesPreview({snapshot,adminSnapshot,live,visitor,review,welcome}:{welcome?:{settings:WelcomeSettings;resources:CampusResource[];content?:CampusContent};review?:{room:TourRoom;role?:'waiting'|'student';studyPreview?:boolean;lessonContent?:ReactNode;returnHref?:string};snapshot:CampusSnapshot;adminSnapshot?:CampusAdminSnapshot;live?:TourLiveConnection;visitor?:TourVisitor}){
 const welcomeSettings=welcome?.settings||live?.welcomeSettings||DEFAULT_WELCOME;
 const assessment=welcomeSettings.assessment||DEFAULT_ASSESSMENT;
 const currentAssessmentKey=welcomeAssessmentKey(assessment);
 const managed=visitor?.content||live?.content||welcome?.content||EMPTY_CONTENT;
 const managedTask=(id:string)=>rooms.flatMap(r=>contentTasks(managed,r.id,role)).find(t=>t.id===id);
 const taskTitle=(id:string)=>Object.values(managed).flatMap(c=>c?.tasks||[]).find(t=>t.id===id)?.title||titles[id]||managedTask(id)?.title||'문샷 안내';
 const devEpoch=useRef(0);
 const devConnection=useRef<ReturnType<typeof import('../webinar/dev-presence').connectDevVisitors>|null>(null);
 const [screenVideo,setScreenVideo]=useState<CampusResource|null>(null);
 function playLibraryVideo(video:CampusResource){setTool('');setScreenVideo(video);setActivityMenu(false);setNotice('');}
 useEffect(()=>{if(screenVideo)post('camera',{mode:'third'});},[screenVideo]);
 const visitorRef=useRef(visitor);useEffect(()=>{visitorRef.current=visitor;},[visitor]);
 const roomName=(id:TourRoom)=>managed[id]?.title||(visitor&&id==='live'?'문샷 오픈 캠퍼스':rooms.find(r=>r.id===id)?.name);
 const visibleTasks=(r:TourRoom,v:TourRole)=>contentTasks(managed,r,v).filter(t=>(!visitor||t.id!=='live-video')&&taskOpen(t.id,live?.modules));
 const avatarKey=visitor?'moonshot-webinar-avatar-v1':TOUR_AVATAR_KEY;
 const [arrival,setArrival]=useState(!!visitor);
 function visitorEntered(){post('meetup-start');if(visitorRef.current?.devPresence&&!devConnection.current){const epoch=devEpoch.current;void import('../webinar/dev-presence').then(m=>{if(epoch===devEpoch.current&&!devConnection.current)devConnection.current=m.connectDevVisitors(value=>post('dev-visitor-state',value),visitorRef.current?.presenceId);}).catch(()=>setNotice('동료 연결이 지연되고 있어요. 공간 체험은 계속할 수 있습니다.'));}setArrival(false);if(failed)setMapOpen(true);visitorRef.current?.onEnter();}
 function readAvatar(){return readTourAvatar(avatarKey,visitor?'문샷 방문자':undefined);}

 const demo=!live,progressKey=live||review?STORAGE+':'+snapshot.viewer.id+':'+snapshot.selectedEnrollmentId:STORAGE;
 const liveRef=useRef(live);useEffect(()=>{liveRef.current=live;},[live]);
 const [role,setRole]=useState<TourRole>(visitor?'guest':review?(review.role||'admin'):live?.role||'student'),[room,setRoom]=useState<TourRoom>(visitor?'live':review?.room||live?.initialRoom||(live?.role==='waiting'?'welcome':'study')),[mapOpen,setMapOpen]=useState(!visitor&&!review&&!live?.initialRoom),[tool,setTool]=useState(review?.lessonContent ? 'learning' : ''),[gate,setGate]=useState<TourRoom|null>(null),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[notice,setNotice]=useState(''),[progress,setProgress]=useState<Progress>(emptyProgress),[storageReady,setStorageReady]=useState(false),[editing,setEditing]=useState(false),[camera,setCamera]=useState(visitor?'third':'overall'),[activityMenu,setActivityMenu]=useState(false);
 const [studyCardHost,setStudyCardHost]=useState<HTMLDivElement|null>(null);
 const [enteredStudy,setEnteredStudy]=useState(false);
 const firstDeskRead=useRef(false);
 const [deskFrameVisible,setDeskFrameVisible]=useState(false);
 const [deskList,setDeskList]=useState<{enrollment:typeof snapshot.selectedEnrollmentId;jobs:OfficeDeskJob[];profiles:BotDocument['profiles']}|null>(null);
 const studentOffice=!!live&&role==='student'&&room==='office';
 // 3D를 쓸 수 없는 브라우저는 3D 로딩을 기다리지 않고 바로 평면 화면으로 간다.
 // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser capability is only known after mount.
 useEffect(()=>{try{const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');if(!gl)setFailed(true);else gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{setFailed(true);}},[]);
 const deskLoaded=!!deskList&&deskList.enrollment===snapshot.selectedEnrollmentId;
 const studentMap=!!live&&role==='student'&&mapOpen;
 const sharedStudy=!!live?.studyPresence&&role==='student'&&room==='study';
 useEffect(()=>{
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Mirror room/map state; the roster session must precede the 3D scene.
  if(!sharedStudy)setEnteredStudy(false);
  else if(!mapOpen)setEnteredStudy(true);
 },[sharedStudy,mapOpen]);
 // On the first visit the map covers the world. Start the scene after the
 // student's roster session is established so WebGL startup cannot block it.
 const [sceneStarted,setSceneStarted]=useState(!sharedStudy&&!studentMap&&!studentOffice);
 // Let the first chat take priority over WebGL initialization. Once the world
 // is ready, keep its iframe and the student's position when opening chat.
 const deferSceneForChat=sharedStudy&&tool==='lounge'&&!ready;
 useEffect(()=>{
  if(sceneStarted||studentMap)return;
  if(studentOffice){
   // Give the signed-in desk read and its first paint priority over WebGL startup.
   if(tool)return;
   // On touch screens give the HTML actions a brief input window before WebGL
   // can occupy the main thread. Selecting a job cancels this timer.
   const touch=window.matchMedia('(pointer: coarse), (max-width: 600px)').matches;
   const delay=deskLoaded?(touch?900:80):1800;
   const timer=setTimeout(()=>setSceneStarted(true),delay);
   return ()=>clearTimeout(timer);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Mirror room/map state; the roster session must precede the 3D scene.
  if(!sharedStudy){setSceneStarted(true);return;}
  if(mapOpen)return;
  const fallback=setTimeout(()=>setSceneStarted(true),1800);
  return ()=>clearTimeout(fallback);
 },[sceneStarted,sharedStudy,mapOpen,studentMap,studentOffice,deskLoaded,tool]);
 const track=useCampusAnalytics(visitor?.analyticsScope||(!visitor&&live?'member':undefined),room);
 useEffect(()=>{if(tool)track('tool_open',tool);},[tool]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(gate)track('room_gate',gate);},[gate]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(mapOpen)track('map_open');},[mapOpen]); // eslint-disable-line react-hooks/exhaustive-deps
 const [officeFilter,setOfficeFilter]=useState<{id:string;name:string;jobId?:string}|null>(null);
 // 사무실에서 직원(이름표·자리)을 눌렀을 때 뜨는 상태 카드의 직원.
 const [staffCard,setStaffCard]=useState<string|null>(null);
 const restoredRoom=useRef(false);
 const [toolsVisited,setToolsVisited]=useState(false),[toolsPane,setToolsPane]=useState<'focus'|'lounge'|'settings'|'profile'>('focus'),[taskQuery,setTaskQuery]=useState(''),[previous,setPrevious]=useState(''),[handoff,setHandoff]=useState<{lessonId:string;context:string}|null>(null),[aiVisited,setAiVisited]=useState(false),[officeVisited,setOfficeVisited]=useState(false),[fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{const change=()=>setFullscreen(document.fullscreenElement===shell.current);document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change);},[]);
 const [selectedLesson,setSelectedLesson]=useState('');
 const [requestedLesson,setRequestedLesson]=useState('');
 const frame=useRef<HTMLIFrameElement>(null),shell=useRef<HTMLDivElement>(null),token=useRef(''),state=useRef({role,room,tool,mapOpen,gate,camera});
 useEffect(()=>{
  const node=shell.current;if(!node)return;
  const nodes=[document.documentElement,document.body],before=nodes.map(n=>({value:n.style.getPropertyValue('overscroll-behavior'),priority:n.style.getPropertyPriority('overscroll-behavior')}));
  nodes.forEach(n=>n.style.setProperty('overscroll-behavior','none'));
  const chrome=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('[data-campus-chrome]')&&!target.closest('input,textarea,select,a,[contenteditable="true"]');
  const prevent=(e:Event)=>{if(chrome(e.target))e.preventDefault();};
  node.addEventListener('contextmenu',prevent);node.addEventListener('selectstart',prevent);
  return()=>{nodes.forEach((n,i)=>{if(before[i].value)n.style.setProperty('overscroll-behavior',before[i].value,before[i].priority);else n.style.removeProperty('overscroll-behavior');});node.removeEventListener('contextmenu',prevent);node.removeEventListener('selectstart',prevent);};
 },[]);
 const [bridge,setBridge]=useState('');
 // Keep controls in the visible area when a phone keyboard reduces the viewport.
 useEffect(()=>{const viewport=window.visualViewport,node=shell.current;if(!viewport||!node)return;const resize=()=>{if(viewport.scale!==1)return;node.style.setProperty('--campus-visible-height',`${viewport.height}px`);node.style.setProperty('--campus-visible-top',`${viewport.offsetTop}px`);};resize();viewport.addEventListener('resize',resize);viewport.addEventListener('scroll',resize);return()=>{viewport.removeEventListener('resize',resize);viewport.removeEventListener('scroll',resize);};},[]);
 useEffect(()=>{token.current=crypto.randomUUID();setBridge(token.current);setProgress(readProgress(progressKey));setStorageReady(true);},[progressKey]);
 useEffect(()=>{if(storageReady)try{localStorage.setItem(progressKey,JSON.stringify(progress));}catch{queueMicrotask(()=>setNotice('브라우저 저장이 차단되어 이번 창에서만 준비 기록이 유지돼요.'));}},[progress,storageReady,progressKey]);
 function post(type:string,payload:Record<string,unknown>={}){frame.current?.contentWindow?.postMessage({source:'moonshot-tour-host',token:token.current,type,payload},location.origin);}
 const accountWelcome=!!snapshot.selectedEnrollmentId&&((!!live&&live.role!=='admin')||review?.role==='waiting');
 const welcomeLoaded=useRef(false),welcomePending=useRef(false),welcomeQueue=useRef<Promise<unknown>>(Promise.resolve()),welcomeFailed=useRef(new globalThis.Map<string,Record<string,unknown>>());
 const [welcomeSaving,setWelcomeSaving]=useState(0),[welcomeError,setWelcomeError]=useState(''),[firstNotice,setFirstNotice]=useState(false);
 async function saveWelcome(command:Record<string,unknown>){
  setWelcomeSaving(n=>n+1);
  const run=welcomeQueue.current.catch(()=>{}).then(async()=>{const r=await fetch('/api/campus/welcome',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enrollmentId:snapshot.selectedEnrollmentId,...command}),signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw Error(data.error||'준비 기록을 저장하지 못했어요.');return data;});
  welcomeQueue.current=run;
  try{const data=await run;welcomeFailed.current.delete(String(command.kind));if(!welcomeFailed.current.size)setWelcomeError('');return data;}catch(e){welcomeFailed.current.set(String(command.kind),command);setWelcomeError((e as Error).message||'저장하지 못했어요. 다시 시도해 주세요.');throw e;}finally{setWelcomeSaving(n=>n-1);}
 }
 function openWelcomeNotice(){welcomePending.current=false;setFirstNotice(true);setMapOpen(false);setTool('notices');void saveWelcome({kind:'notice'}).catch(()=>{});}
 function updateProgress(next:Progress|((old:Progress)=>Progress)){
  const p=typeof next==='function'?next(progress):next;setProgress(p);
  if(accountWelcome&&welcomeLoaded.current)void saveWelcome({kind:'progress',assessmentKey:currentAssessmentKey,progress:p}).catch(()=>{});
 }
 useEffect(()=>{
  if(!accountWelcome||(live&&!live.welcomeSettings)||!ready||room!=='welcome'||welcomeLoaded.current)return;
  const c=new AbortController();
  void fetch('/api/campus/welcome?enrollmentId='+snapshot.selectedEnrollmentId,{cache:'no-store',signal:c.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'내 준비 기록을 불러오지 못했어요.');if(c.signal.aborted)return;welcomeLoaded.current=true;
   if(data.state?.assessmentKey===currentAssessmentKey)setProgress(data.state.progress);else setProgress({video:false,quiz:assessment.quiz.map(()=>null),level:assessment.level.map(()=>-1)});
   if(data.avatar)post('appearance',data.avatar);
   if(welcomeSettings.autoWelcome&&!data.state?.noticeSeen){welcomePending.current=true;setMapOpen(false);if(data.avatarChosen)openWelcomeNotice();else{setTool('');post('blocked',{value:false});post('appearance-open');}}
  }).catch(e=>{if(e.name!=='AbortError')setWelcomeError(e.message);});return()=>c.abort();
 },[accountWelcome,ready,room,snapshot.selectedEnrollmentId,currentAssessmentKey,welcomeSettings.autoWelcome,live?.welcomeSettings]); // eslint-disable-line react-hooks/exhaustive-deps
 async function saveAccountAvatar(raw:unknown){try{const value=tourAvatar(raw);await saveWelcome({kind:'avatar',avatar:value});post('appearance',value);post('appearance-result',{ok:true});window.dispatchEvent(new Event('campus:avatar-saved'));if(welcomePending.current)openWelcomeNotice();else setNotice('캐릭터를 내 계정에 저장했어요.');}catch(e){post('appearance-result',{ok:false,error:(e as Error).message});}}
 function mayLeave(all=false){if(welcomeSaving){setNotice('준비 기록을 저장하고 있어요. 잠시 후 이동해 주세요.');return false;}const g=campusDraftState(undefined,!all);const locked=campusDraftState().locked;if(locked){setNotice('저장 중이에요. 마친 뒤 이동해 주세요.');return false;}return (!all&&(['ai','office'].includes(tool)||!!spacePane(tool)))||!g.dirty||window.confirm('저장하지 않은 내용이 있습니다. 내용을 버리고 이동할까요?');}
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
 function closeTask(){if(!mayLeave())return;setTool('');setPrevious('');}
 function canVisit(id:TourRoom){return canEnter(role,id)||visitor?.operatorReview===true;}
 async function exitCampus(){if(!mayLeave(true))return;if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}window.location.assign(review?.returnHref || (visitor?'/':review&&review.role!=='waiting'?'/admin':'/my/classes'));}
 // A document navigation releases the WebGL scene/presence and rechecks operator auth.
 // eslint-disable-next-line @next/next/no-location-assign-relative-destination
 function enter(id:TourRoom){post('meetup-start');if(!mayLeave())return;if(visitorRef.current?.operatorReview&&!['live','library'].includes(id)){const q=new URLSearchParams({room:id});if(visitorRef.current.operatorEvent)q.set('event',visitorRef.current.operatorEvent);window.location.assign('/campus/operator?'+q);return;}if(!canEnter(role,id)){setMapOpen(false);setActivityMenu(false);setGate(id);return;}let first=false;if(id==='office'&&live&&role==='student'){try{const key='campus:office-guide:v1:'+snapshot.viewer.id;first=!localStorage.getItem(key);if(first)localStorage.setItem(key,'seen');}catch{}}
 setRoom(id);setMapOpen(false);setGate(null);setTool(first?'office-guide':'');setPrevious('');setActivityMenu(false);setNotice('');post('room',{id});
 // 들어온 공간을 주소에 적어 둔다. 새로고침하거나 수업에서 돌아올 때 지도 대신 이 공간이 열린다.
 if(live&&role==='student'){try{const u=new URL(location.href);u.searchParams.set('room',id);history.replaceState(history.state,'',u);}catch{}}}
 function selectTask(id:string){const t=managedTask(id);if(!t||!taskOpen(id,live?.modules)||t.admin&&role!=='admin')return;if(!canEnter(role,t.room)){setGate(t.room);return;}if(!mayLeave())return;
  // 조명·배경음은 버튼 하나뿐인 중간 화면을 거치지 않고 3D 화면의 설정 창을 바로 연다.
  if(id==='sound'&&ready&&!failed&&room===t.room){setTool('');setPrevious('');setMapOpen(false);setActivityMenu(false);setNotice('');post('environment-open');return;}
  if(room!==t.room){setRoom(t.room);post('room',{id:t.room});}setPrevious('');if(id==='learning')setRequestedLesson('');setTool(id);visitorRef.current?.onActivity(id);if(id==='legacy-space')setReady(false);setMapOpen(false);setActivityMenu(false);setNotice('');if(id==='office')setOfficeVisited(true);if(id==='ai')setAiVisited(true);const pane=spacePane(id);if(pane){setToolsPane(pane);setToolsVisited(true);}if(id==='focus')post('sit');}
 function open(id:string){if(visibleTasks(room,role).some(t=>t.id===id)){if(id==='office')setOfficeFilter(null);selectTask(id);}}
 function openLesson(id:string,missionId?:string){if(!mayLeave(true))return;track('lesson_open',id);if(live){
   if(!missionId && snapshot.guidedLessons === true && process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED==='true' && canEnter(role,'study') && snapshot.lessons.some(lesson=>lesson.id===id)){
     setRequestedLesson(id);setPrevious(tool==='learning'?'':tool);setRoom('study');post('room',{id:'study'});setTool('learning');return;
   }
   live.onOpen(id,missionId);return;
 }setPrevious(tool);setSelectedLesson(snapshot.lessons.find(l=>l.id===id)?.title||'오늘 수업');setTool('lesson');}
 function ask(value:{lessonId:string;context:string}){if(!mayLeave(true))return;setPrevious(tool);setHandoff(value);setAiVisited(true);setTool('ai');}
 // 주소에 공간이 적혀 있으면(새로고침, 수업에서 돌아옴) 지도 대신 그 공간으로 바로 들어간다.
 // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- a one-time restore once the live view is there
 useEffect(()=>{if(restoredRoom.current||!live||role!=='student')return;restoredRoom.current=true;const want=requestedRoom(location.search) as TourRoom|null;if(want&&canEnter(role,want))enter(want);},[live]);
 function navigate(id:string){selectTask(({community:'feedback',business:'business:brief',support:'support:request',learning:'learning'} as Record<string,string>)[id]||id);}
 useEffect(()=>{state.current={role,room,tool,mapOpen,gate,camera};},[role,room,tool,mapOpen,gate,camera]);
 useEffect(()=>{const receive=(event:MessageEvent)=>{const m=event.data;if(event.source!==frame.current?.contentWindow||event.origin!==location.origin||m?.source!=='moonshot-tour'||m.token!==token.current||!token.current)return;const s=state.current;
 if(m.type==='office-desk-check'&&liveRef.current&&s.role==='student'&&s.room==='office'&&!s.mapOpen&&!s.tool&&snapshot.selectedEnrollmentId){
  firstDeskRead.current=true;
  invalidateOfficeView(snapshot.selectedEnrollmentId);
 }
 if(m.type==='office-desks-visible'&&s.room==='office'&&s.role==='student')setDeskFrameVisible(m.payload?.visible===true);if(m.type==='error')setDeskFrameVisible(false);if(m.type==='office-desk-job'&&liveRef.current&&s.role==='student'&&s.room==='office'&&!s.tool&&!s.mapOpen&&visibleTasks('office',s.role).some(t=>t.id==='office')){
   const desk=deskTargets.current.get(m.payload?.jobId);
   if(desk){setOfficeFilter(desk);setOfficeVisited(true);setTool('office');}
 }if(m.type==='office-desk-employee'&&liveRef.current&&s.role==='student'&&s.room==='office'&&!s.tool&&!s.mapOpen&&typeof m.payload?.employeeId==='string')setStaffCard(m.payload.employeeId);
 if(m.type==='activity')window.dispatchEvent(new Event('campus:activity-pulse'));if(m.type==='ready'){setReady(true);setFailed(false);post('role',{role:s.role});post('room',{id:s.room});post('camera',{mode:s.camera});post('appearance',liveRef.current?(liveRef.current.avatar||tourAvatar({nickname:snapshot.viewer.displayName})):readAvatar());post('progress',{level:liveRef.current?liveRef.current.level||0:getCommunityDemoRewards(snapshot.selectedEnrollmentId||'')?.level||0});post('blocked',{value:!!(s.mapOpen||s.tool||s.gate)});}if(m.type==='dev-visitor-move'&&(visitorRef.current?.devPresence||liveRef.current?.publicPresence))devConnection.current?.move(m.payload);if(m.type==='visitor-reaction')window.dispatchEvent(new CustomEvent('campus:activity',{detail:{action:'reaction'}}));if(m.type==='visitor-reaction'&&(visitorRef.current?.devPresence||liveRef.current?.publicPresence)&&['live','library'].includes(s.room))devConnection.current?.react(m.payload?.code);if(m.type==='visitor-story'&&visitorRef.current&&['study','office','welcome'].includes(m.payload?.id)){setTool('story:'+m.payload.id);visitorRef.current.onActivity('experience');}if(m.type==='camera'&&['overall','third','first'].includes(m.payload?.mode)){if(s.camera!==m.payload.mode)window.dispatchEvent(new CustomEvent('campus:activity',{detail:{action:'camera_switch',target:m.payload.mode}}));setCamera(m.payload.mode);}if(m.type==='editor')setEditing(m.payload?.open===true);if(m.type==='appearance-save'){if(accountWelcome&&s.room==='welcome'){void saveAccountAvatar(m.payload);return;}window.dispatchEvent(new CustomEvent('campus:activity',{detail:{action:'avatar_save'}}));if(liveRef.current){void liveRef.current.saveAvatar(tourAvatar(m.payload)).then(value=>{post('appearance',value);post('appearance-result',{ok:true});setNotice('캐릭터를 내 계정에 저장했어요. 다시 입장해도 유지돼요.');}).catch((e:Error)=>post('appearance-result',{ok:false,error:e.message||'저장하지 못했어요. 다시 시도해 주세요.'}));return;}try{const value=tourAvatar(m.payload);localStorage.setItem(avatarKey,JSON.stringify(value));post('appearance',value);post('appearance-result',{ok:true});setNotice('캐릭터를 이 브라우저에 저장했어요. 다시 열어도 유지돼요.');if(visitorRef.current)visitorEntered();}catch{post('appearance-result',{ok:false,error:'브라우저 저장이 차단되어 저장하지 못했어요. 저장 허용 후 다시 시도해 주세요.'});}}if(m.type==='destination'&&['live','library','study','office','welcome'].includes(m.payload?.id)){enter(m.payload.id);}if(m.type==='error'){setFailed(true);if(!(liveRef.current&&s.role==='student'&&s.room==='office'))setNotice('3D 로딩에 문제가 있어도 공간 이동과 활동 메뉴로 흐름을 확인할 수 있어요.');}if(m.type==='action'&&canEnter(s.role,s.room)&&visibleTasks(s.room,s.role).some(t=>t.id===m.payload?.id)){setTool(m.payload.id);visitorRef.current?.onActivity(m.payload.id);if(m.payload.id==='office'){setOfficeFilter(null);setOfficeVisited(true);}if(m.payload.id==='focus'){setToolsPane('focus');setToolsVisited(true);post('sit');}}};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[snapshot.selectedEnrollmentId,snapshot.viewer.displayName,avatarKey,accountWelcome,managed]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(ready)post('content-config',{tasks:rooms.flatMap(r=>contentTasks(managed,r.id,role).filter(t=>!t.id.startsWith('content:')).map(t=>({...t,custom:!!managed[r.id]?.tasks.some(v=>v.id===t.id)})))});},[ready,managed,role]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(ready)post('blocked',{value:!!(mapOpen||tool||gate||activityMenu||arrival||screenVideo)});},[mapOpen,tool,gate,activityMenu,arrival,ready,screenVideo]);
 function changeRole(next:TourRole){if(live||visitor)return;if(!mayLeave(true))return;setRole(next);setToolsVisited(false);setAiVisited(false);setHandoff(null);setPrevious('');setOfficeVisited(false);setGate(null);setTool('');setMapOpen(true);setActivityMenu(false);post('role',{role:next});if(!canEnter(next,room)){setRoom('live');post('room',{id:'live'});}}
 useEffect(()=>{if(live)return;const sync=(e:StorageEvent)=>{if(e.key===avatarKey&&e.storageArea===localStorage)post('appearance',readAvatar());};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[live,avatarKey]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const sync=(e:Event)=>{const detail=(e as CustomEvent).detail;if(detail?.demo===demo&&detail.enrollmentId===snapshot.selectedEnrollmentId)post('progress',{level:detail.rewards?.level||0});};window.addEventListener('campus:community-changed',sync);return()=>window.removeEventListener('campus:community-changed',sync);},[snapshot.selectedEnrollmentId,demo]);
 useEffect(()=>{if(live?.avatar&&ready&&!editing)post('appearance',live.avatar);},[live?.avatar,ready,editing]);
 useEffect(()=>{if(live&&ready)post('progress',{level:live.level||0});},[live?.level,ready]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!live?.publicPresence||!ready)return;let disposed=false;
  if(room==='live'||room==='library'){post('meetup-start');void import('../webinar/dev-presence').then(m=>{if(!disposed&&!devConnection.current)devConnection.current=m.connectDevVisitors(value=>post('dev-visitor-state',value));}).catch(()=>setNotice('동료 연결이 지연되고 있어요. 공간은 계속 이용할 수 있어요.'));}
  return()=>{disposed=true;devConnection.current?.close();devConnection.current=null;post('dev-visitor-state',{connected:false,count:0,people:[]});};
 },[live?.publicPresence,room,ready]);
 useEffect(()=>()=>{devEpoch.current++;devConnection.current?.close();devConnection.current=null;},[]);
 const previousDeskView=useRef('');
 const deskTargets=useRef(new globalThis.Map<string,OfficeDeskJob>());
 const refreshDesks=useCallback(async(signal?:AbortSignal)=>{
   const confirmFirstDesk=firstDeskRead.current;
   if(confirmFirstDesk)firstDeskRead.current=false;
   try {
    const params=new URLSearchParams({enrollmentId:snapshot.selectedEnrollmentId||''});
    if(role==='student')params.set('desks','1');
    const response=await fetch('/api/campus/office/agents?'+params,{cache:'no-store',signal});
    if(!response.ok)throw Error('사무실 좌석을 읽지 못했습니다.');
    const data=await response.json() as {document:BotDocument;desks?:{jobId:string;employeeId:string;status:OfficeDeskJob['status']}[]};
    if(signal?.aborted)return;
    const nextView=JSON.stringify(data);
    if(nextView===previousDeskView.current)return;
    previousDeskView.current=nextView;
    const targets=new globalThis.Map<string,OfficeDeskJob>();
    for(const desk of data.desks||[]){
      const profile=data.document.profiles.find(p=>p.employeeId===desk.employeeId);
      if(profile)targets.set(desk.jobId,{id:profile.employeeId,name:profile.name,jobId:desk.jobId,status:desk.status});
    }
    deskTargets.current=targets;
    setDeskList({enrollment:snapshot.selectedEnrollmentId,jobs:[...targets.values()],profiles:data.document.profiles});
    post('personal-office',{document:data.document,desks:data.desks});
   } finally {
    if(confirmFirstDesk&&!signal?.aborted)post('office-desk-check-done');
   }
 },[snapshot.selectedEnrollmentId,role]);
 const clearDesks=useCallback(()=>{
   firstDeskRead.current=false;
   previousDeskView.current='';
   deskTargets.current.clear();
   setDeskList(null);
   post('office-desks-clear');
 },[]);
 const desksVisible=!!live&&canEnter(role,'office')&&room==='office'&&!mapOpen&&!tool&&!gate&&!activityMenu;
 useOfficeLive({enabled:desksVisible,keepConnected:!!live&&room==='office'&&tool==='office'&&canEnter(role,'office'),enrollment:snapshot.selectedEnrollmentId,refresh:refreshDesks,onError:clearDesks,slow:false});
 // A first desk read can finish before the 3D frame installs its message listener.
 useEffect(()=>{if(ready&&desksVisible&&previousDeskView.current)post('personal-office',JSON.parse(previousDeskView.current));},[ready,desksVisible]);
 useEffect(()=>clearDesks,[snapshot.selectedEnrollmentId,desksVisible,clearDesks]);

 const quizDone=assessment.quiz.every((_,i)=>typeof progress.quiz[i]==='boolean'),levelDone=assessment.level.every((_,i)=>progress.level[i]>=0),done=Number(progress.video)+Number(quizDone)+Number(levelDone);
 const welcomeResources=welcome?.resources||live?.libraryResources||[];
 const welcomeBody=['video','notices','basics'].includes(tool)?<WelcomePanel initialArticle={firstNotice&&tool==='notices'?welcomeSettings.notices.find(a=>a.published)?.id:undefined} onNavigate={setTool} completed={progress.video} onComplete={()=>updateProgress(p=>({...p,video:!p.video}))} key={tool} action={tool} settings={welcomeSettings} resources={welcomeResources} onPlay={playLibraryVideo}/>:tool==='quiz'||tool==='level'?<AssessmentPanel key={tool} kind={tool} assessment={assessment} progress={progress} onChange={updateProgress} onNavigate={setTool}/>:<><p>{accountWelcome?'준비 기록은 내 계정에 저장됩니다. 다른 기기에서도 이어서 확인할 수 있어요.':'미리보기 준비 기록은 이 브라우저에만 남아요.'}</p><div className={styles.progressTrack}><span style={{width:done/3*100+'%'}}/></div><h3>{done}/3 준비 완료</h3>{[['video','라이브 다시보기',progress.video],['quiz','OX 퀴즈',quizDone],['level','AI 수준 확인',levelDone]].map(([id,label,finished])=><button key={String(id)} className={styles.checklist} onClick={()=>setTool(String(id))}><span>{finished?'✓':'○'} {label}</span><span>{finished?'다시 보기':'시작하기'} →</span></button>)}{done===3&&<div className={styles.result}><h3>첫 도약 준비 완료!</h3><p>{role==='waiting'?'개강 전 구매자는 준비를 마쳐도 정규 공부방이 열리지 않아요. 수강 시작일에 입장할 수 있어요.':'이제 공부방에서 첫 실행을 시작해 보세요.'}</p><button disabled={editing} className={styles.primary} onClick={()=>{setTool('');setMapOpen(true);}}>공간 이동</button></div>}</>;
 const waitingForOffice=useRef(false);
 const startTourFrame=useCallback(()=>{
  setDeskFrameVisible(false);
  post('init',{studentOffice,personalOffice:studentOffice&&desksVisible&&deskLoaded&&previousDeskView.current?JSON.parse(previousDeskView.current):null,visitor:!!visitor,devPresence:visitor?.devPresence===true||live?.publicPresence===true,qaCrowd:visitor?.qaCrowd===true,ambientCount:visitor?.ambientCount||0,operatorReview:visitor?.operatorReview===true});
 },[studentOffice,desksVisible,deskLoaded,visitor,live?.publicPresence]);
 useEffect(()=>{
  if(sceneStarted&&waitingForOffice.current&&frame.current){
   waitingForOffice.current=false;startTourFrame();
  }
 },[sceneStarted,startTourFrame]);
 const staffPerson=desksVisible&&!editing&&staffCard?deskList?.profiles.find(p=>p.employeeId===staffCard):undefined;
 // The card belongs to the office view: leaving it (a window, the map, another room) puts it away.
 // eslint-disable-next-line react-hooks/set-state-in-effect -- closing follows a view change made elsewhere in this component
 useEffect(()=>{if(!desksVisible)setStaffCard(null);},[desksVisible]);
 const pendingDeskJobs=desksVisible&&role==='student'&&deskList?.enrollment===snapshot.selectedEnrollmentId&&
   visibleTasks('office',role).some(task=>task.id==='office') ? deskList?.jobs : undefined;
 const deskShortcuts=!editing&&pendingDeskJobs?.length ? <section className={styles.deskShortcuts} aria-label="직원 업무">
   <strong>직원 업무 <small>{pendingDeskJobs.length}건</small></strong><ul className={styles.loadingDeskList}>{pendingDeskJobs.slice().sort((a,b)=>Number(b.status==='running')-Number(a.status==='running')).map(job=>{
     const label=job.status==='running'?'진행 중':'검토할 결과';
     return <li key={job.jobId}><button type="button" aria-label={job.name+' · '+label+' 업무 열기'} onClick={()=>{
       setOfficeFilter(job);selectTask('office');
     }}><span>{job.name}</span><strong>{label} →</strong></button></li>;
   })}</ul>
 </section> : null;
 // 3D를 열 수 없는 브라우저(그래픽 가속 꺼짐)에서는 같은 좌석과 업무를 평면 목록으로 보여 준다.
 const flatOffice=failed&&studentOffice&&desksVisible&&!editing ? <section className={styles.flatOffice} aria-label="사무실 간단히 보기">
   <h2>3D 화면을 열 수 없어 간단한 화면으로 보여드려요</h2>
   <p>이 브라우저에서는 3D 사무실을 그릴 수 없어요. 직원과 업무는 아래에서 그대로 확인할 수 있어요.</p>
   <ol>{[0,1,2,3,4,5,6,7,8,9].map(seat=>{
     const profile=pendingDeskJobs?deskList?.profiles.find(p=>p.seatIndex===seat):undefined,job=profile&&pendingDeskJobs?.find(j=>j.id===profile.employeeId);
     return <li key={seat} data-empty={profile?undefined:''}><small>{seat?seat+'번 자리':'총괄 관리자 자리'}</small><strong>{profile?.name||'빈자리'}</strong>
       {job?<button type="button" aria-label={job.name+' · '+(job.status==='running'?'진행 중':'검토할 결과')+' 업무 열기'} onClick={()=>{setOfficeFilter(job);selectTask('office');}}>{job.status==='running'?'진행 중':'검토할 결과'} →</button>:profile&&<button type="button" aria-label={profile.name+' 상태 보기'} onClick={()=>setStaffCard(profile.employeeId)}>대기 중 · 상태 보기</button>}</li>;
   })}</ol>
   <p>3D로 보려면 ① 브라우저를 완전히 종료한 뒤 다시 열기 ② 설정 › 시스템 › &lsquo;가능한 경우 그래픽 가속 사용&rsquo; 켜기 ③ 그래도 안 되면 Chrome이나 Edge 최신 버전으로 열기. 공간 전체 보기·3인칭 보기·내 캐릭터는 3D 화면에서만 쓸 수 있어요.</p>
   <button type="button" onClick={()=>{setFailed(false);setReady(false);frame.current?.contentWindow?.location.reload();}}>3D 다시 시도</button>
 </section> : null;
 // 사무실 밖의 공간(공부방 등)도 3D를 못 여는 브라우저에서는 그 공간의 할 일을 바로 열 수 있는 간단한 화면을 보여 준다.
 const flatRoom=failed&&!!live&&role==='student'&&!studentOffice&&!mapOpen&&!tool&&!gate&&!editing&&!activityMenu ? <section className={styles.flatOffice+' '+styles.flatRoom} aria-label="간단히 보기">
   <h2>3D 화면을 열 수 없어 간단한 화면으로 보여드려요</h2>
   <p>이 브라우저에서는 3D 공간을 그릴 수 없어요. 이 공간에서 할 일은 아래에서 그대로 열 수 있어요.</p>
   <ol>{visibleTasks(room,role).map(t=><li key={t.id}><button type="button" onClick={()=>selectTask(t.id)}><strong>{t.title}</strong><small>{t.description}</small></button></li>)}</ol>
   <p>3D로 보려면 ① 브라우저를 완전히 종료한 뒤 다시 열기 ② 설정 › 시스템 › &lsquo;가능한 경우 그래픽 가속 사용&rsquo; 켜기 ③ 그래도 안 되면 Chrome이나 Edge 최신 버전으로 열기.</p>
   <button type="button" onClick={()=>{setFailed(false);setReady(false);frame.current?.contentWindow?.location.reload();}}>3D 다시 시도</button>
 </section> : null;
 const sceneLoading=!ready&&!deskShortcuts&&!(studentOffice&&deskFrameVisible)&&!mapOpen&&tool!=='legacy-space'
  ? !failed&&<p className={styles.loading} role="status">공간과 캐릭터를 준비하고 있어요…</p> : null;
 return <div ref={shell} className={styles.root} data-room={room} data-editing={editing} data-flat={flatOffice||flatRoom?'':undefined}>
 {room==='welcome'&&accountWelcome&&(welcomeSaving>0||welcomeError)&&<div className={styles.accountSave} role={welcomeError?'alert':'status'}>{welcomeError||'준비 기록을 저장하고 있어요…'}{welcomeError&&<button onClick={()=>{if(welcomeLoaded.current){for(const command of welcomeFailed.current.values())void saveWelcome(command).catch(()=>{});}else window.location.reload();}}>다시 시도</button>}</div>}<LibraryScreen roomLabel={room==='welcome'?'웰컴 존':'자료실'} video={screenVideo} onClose={()=>{setScreenVideo(null);setTool(room==='welcome'?'video':'library:replay');}}/><header className={styles.top} data-campus-chrome><div className={styles.brand}><Orbit size={23}/><div><strong>{roomName(room)}</strong>{room==='office'&&live&&role==='student'?<button type="button" className={styles.officeHelp} aria-label="개인 사무실 이용 안내" onClick={()=>{if(mayLeave()){setTool('office-guide');setActivityMenu(false);}}}>사무실 이용 안내 →</button>:<small>{room==='library'?'누구나 꺼내 보는 무료 자료':room==='office'?'나만의 개인 공간':room==='live'?(visitor?'AI 마케팅을 배우고 실행하는 곳':'모두에게 열린 공간'):room==='welcome'?welcomeSettings.title:'함께 실행하는 수강생 공간'}</small>}</div></div><div className={styles.topButtons}><button disabled={editing} className={styles.primary} onClick={()=>{if(!mayLeave())return;setTool('');setPrevious('');setActivityMenu(false);setMapOpen(true);}}><Map size={17}/>공간 이동</button><button disabled={editing} aria-label={fullscreen?'전체화면 종료':'전체화면'} onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else if(shell.current?.requestFullscreen)void shell.current.requestFullscreen().catch(()=>setNotice('이 브라우저에서는 현재 화면 크기로 이용해 주세요.'));else setNotice('이 브라우저에서는 전체화면을 지원하지 않아요. 현재 화면에서 모든 기능을 이용할 수 있어요.');}}>{fullscreen?<Minimize size={18}/>:<Maximize size={18}/>}</button><button disabled={editing} className={styles.exitButton} aria-label="캠퍼스 나가기" onClick={()=>void exitCampus()}><DoorOpen size={18}/><span>나가기</span></button></div></header>
 <div className={styles.scene}>{bridge&&(sceneStarted||studentOffice&&!mapOpen&&!tool)&&!deferSceneForChat&&tool!=='legacy-space'&&<iframe title="문샷 캠퍼스 3D 미리보기" ref={frame} src={'/campus/world/tour/index.html'+(process.env.NEXT_PUBLIC_CAMPUS_LOCAL_MEETUP==='true'&&typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('meet')==='1'?'?previewMeetup=1'+(new URLSearchParams(window.location.search).get('qaChat')==='1'?'&qaChat=1':''):'')+'#bridge='+bridge} sandbox="allow-scripts allow-same-origin" onLoad={()=>{if(sceneStarted)startTourFrame();else waitingForOffice.current=true;}}/>}</div>
 {flatOffice}
 {flatRoom}
 {staffPerson&&snapshot.selectedEnrollmentId&&<EmployeeCard key={staffPerson.employeeId} enrollmentId={snapshot.selectedEnrollmentId} person={staffPerson} onClose={()=>setStaffCard(null)}
   onInbox={()=>{setStaffCard(null);setOfficeFilter({id:staffPerson.employeeId,name:staffPerson.name});selectTask('office');}}
   onJob={jobId=>{setStaffCard(null);setOfficeFilter({id:staffPerson.employeeId,name:staffPerson.name,jobId});selectTask('office');}}/>}
 <footer className={styles.bottom} data-campus-chrome>{!live&&!visitor&&!review&&<details className={styles.qa}><summary>미리보기 · {roleNames[role]}</summary><label>입장 권한 체험<select disabled={editing} aria-label="입장 권한 체험" value={role} onChange={e=>changeRole(e.target.value as TourRole)}>{Object.entries(roleNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><p>가상 계정입니다. 실제 권한·결제·서버 기록은 바뀌지 않아요.</p></details>}{live&&<Link className={styles.backLink} href="/my/classes">내 클래스로</Link>}{review&&<span className={styles.reviewLabel}>{review.returnHref?<Link href={review.returnHref}>수업 검수로 돌아가기</Link>:review.role==='waiting'?<Link href="/my/classes">내 클래스 · 개강 전 준비</Link>:'운영자 둘러보기 · 모든 공간 입장 가능'}</span>}<div className={styles.bottomActions}>{!failed&&<><button disabled={!ready||editing} onClick={()=>{setActivityMenu(false);post('camera',{mode:'overall'});}}>공간 전체 보기</button><button disabled={!ready||editing} onClick={()=>{setActivityMenu(false);post('camera',{mode:camera==='third'?'first':'third'});}}>{camera==='third'?'1인칭으로 보기':'3인칭으로 보기'}</button></>}<button disabled={editing} aria-expanded={room==='library'?undefined:activityMenu} onClick={()=>{if(room==='library'){open('library:all');return;}setTaskQuery('');setActivityMenu(v=>!v);}}>{room==='library'?'자료·다시보기':'이 공간에서 할 일'}</button>{!failed&&<button disabled={!ready||editing||!!live&&!visitor&&!review&&!live.avatar} aria-label="내 캐릭터" onClick={()=>{setActivityMenu(false);post('blocked',{value:false});post('appearance-open');}}><Users size={17}/><span>내 캐릭터</span></button>}</div></footer>
 {visitor&&arrival&&!editing&&<section className={styles.arrival} aria-label="방문자 입장"><small>MOONSHOT OPEN CAMPUS</small><h1>{visitor.title}</h1><p>10% 더 나아지는 것을 넘어,<br/>내 일을 10배 다르게 바꿔볼 가능성.<br/>AI 마케팅 기지를 직접 둘러보세요.</p><p className={styles.arrivalGuide}>바닥의 파란 화살표를 따라 문샷 자료실로 가면<br/>무료 자료와 라이브 다시보기를 만날 수 있어요.</p><button className={styles.primary} disabled={!ready} onClick={()=>{post('blocked',{value:false});post('appearance-open');}}>캐릭터 꾸미고 입장</button><button disabled={!ready&&!failed} onClick={visitorEntered}>{failed?'공간 안내로 입장':'이 캐릭터로 바로 입장'}</button><small>가입 없이 체험 · 캐릭터는 이 브라우저에만 저장돼요.<br/>닉네임에 개인정보를 넣지 마세요.</small></section>}
 <div className={styles.miniFocus}>
  {sharedStudy&&<div hidden={mapOpen||!!tool||!!gate||editing||activityMenu}>
   <div ref={setStudyCardHost}/>
   {!mapOpen&&!tool&&!gate&&!editing&&!activityMenu&&managedTask('learning')&&<StudyLessonShortcut snapshot={snapshot} onOpen={openLesson}/>}
   {sceneLoading}
  </div>}
  {!flatOffice&&deskShortcuts}
  {canEnter(role,'study')&&<MiniFocus snapshot={snapshot} demo={demo} onReturn={()=>selectTask('focus')}/>}
  {!sharedStudy&&sceneLoading}
 </div>
 {activityMenu&&<section className={styles.activity} aria-label="이 공간에서 할 일"><header><strong>{roomName(room)}에서 할 일</strong><button aria-label="할 일 목록 닫기" onClick={()=>setActivityMenu(false)}>×</button></header>{room==='welcome'&&<p>{welcomeSettings.description}</p>}<input aria-label="할 일 검색" placeholder="예: 피드백, 성과, 질문" value={taskQuery} onChange={e=>setTaskQuery(e.target.value)}/>{Array.from(new Set(visibleTasks(room,role).map(t=>t.group))).map(group=>{const items=visibleTasks(room,role).filter(t=>t.group===group&&(!taskQuery||(t.title+' '+t.description).includes(taskQuery)));return items.length?<section key={group}><h3>{group}</h3>{items.map(t=><button key={t.id} aria-label={t.title} onClick={()=>open(t.id)}><span><strong>{t.title}</strong><small>{t.description}</small></span><ArrowUpRight size={16}/></button>)}</section>:null;})}{!visibleTasks(room,role).some(t=>!taskQuery||(t.title+' '+t.description).includes(taskQuery))&&<p>다른 단어로 찾아보세요.</p>}{!visitor&&!live&&<details><summary>기존 기능 연결 현황</summary><p>화면 연결과 실제 서비스 검수는 구분합니다.</p><ul>{coverage.features.filter(f=>{const t=taskById(f.destination);return t?.room===room&&(!t.admin||role==='admin');}).map(f=><li key={f.number}>{f.number}. {f.name}{f.status!=='preview'?' · 실제 연결 검수 별도':''}</li>)}</ul></details>}</section>}
 {notice&&!tool&&<p className={styles.notice} role="status">{notice}<button aria-label="안내 닫기" onClick={()=>setNotice('')}>×</button></p>}
 <CampusWindow open={mapOpen} title="공간 이동" onClose={()=>setMapOpen(false)}><div className={styles.mapIntro}><p>MOONSHOT CAMPUS</p><h2>오늘의 도약은 어디에서?</h2><span>목적에 맞는 공간으로 들어가세요.</span>{!live&&!visitor&&!review&&<label className={styles.mapRole}>누구의 입장을 볼까요?<select aria-label="지도에서 권한 체험" value={role} onChange={e=>changeRole(e.target.value as TourRole)}>{Object.entries(roleNames).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><small>미리보기 전용 · 실제 계정과 무관</small></label>}{live&&<p>{snapshot.scopes.find(s=>s.enrollmentId===snapshot.selectedEnrollmentId)?.cohortName} · {snapshot.viewer.displayName}</p>}</div><div className={styles.mapGrid}>{rooms.map((r,i)=><button key={r.id} className={`${styles.destination} ${styles[r.id]}`} aria-label={roomName(r.id)+' 입장'} onClick={()=>enter(r.id)}><div className={styles.miniature}>{managed[r.id]?.image&&<img className={styles.roomCover} src={managed[r.id]?.image} alt={managed[r.id]?.imageAlt||roomName(r.id)}/>}<div className={styles.miniFloor}/><div className={styles.miniBack}/><div className={styles.miniDesk}/><div className={styles.miniDesk2}/><span>0{i+1}</span></div><div className={styles.destinationBody}><small>{r.tag}</small><h3>{roomName(r.id)}{!canVisit(r.id)&&<LockKeyhole size={16}/>}</h3><p>{managed[r.id]?.description||(visitor&&r.id==='live'?'내 캐릭터로 걷고, 문샷에서의 하루를 먼저 만나봐요.':r.description)}</p><div><span>{r.access}</span><strong>{room===r.id?'현재 공간':canVisit(r.id)?'입장하기':'입장 안내'} →</strong></div></div></button>)}</div><p className={styles.mapNote}><DoorOpen size={16}/>현재 권한: {visitor?.operatorReview?'관리자':roleNames[role]} · 잠긴 공간은 눌러서 입장 조건을 확인할 수 있어요.</p></CampusWindow>
 <CampusWindow open={!!gate} small={!visitor} title="공간 입장 안내" onClose={()=>setGate(null)}>{visitor&&gate?visitor.renderGate(gate):<div className={styles.gate}><LockKeyhole size={38}/><h2>{rooms.find(r=>r.id===gate)?.name}</h2><p>{role==='waiting'?'수강 시작일부터 열리는 공간이에요. 개강 전에는 웰컴 존에서 준비해 보세요.':'문샷 수강권이 필요한 공간이에요. 라이브홀에서 교육 내용을 먼저 둘러보세요.'}</p><button className={styles.primary} onClick={()=>enter(role==='waiting'?'welcome':'live')}>{role==='waiting'?'웰컴 존으로 가기':'라이브홀로 돌아가기'}</button>{role!=='waiting'&&<button onClick={()=>{enter('live');setTool('offer');}}>수강 신청·상담 안내 보기</button>}</div>}</CampusWindow>
 <CampusWindow open={!!tool} title={taskTitle(tool)} onClose={closeTask}>
 <div className={styles.taskTrail}><span>{roomName(room)} / {taskTitle(tool)}</span><div>{previous&&<button onClick={()=>{if(mayLeave()){setTool(previous);setPrevious('');}}}>← 이전 작업</button>}<button onClick={()=>{if(!mayLeave())return;setTool('');setPrevious('');setTaskQuery('');setActivityMenu(true);}}>이 공간의 다른 할 일</button></div></div>
 {notice&&<p className={styles.inlineNotice} role="status">{notice}</p>}
 <div className={styles.featureSurface} onClickCapture={event=>{const a=(event.target as Element).closest('a');if(live||visitor||review||!a||a.hasAttribute('download')||a.getAttribute('href')?.startsWith('blob:'))return;const href=a.getAttribute('href')||'';if(!href||href.startsWith('#'))return;event.preventDefault();event.stopPropagation();const lesson=snapshot.lessons.find(l=>l.href===href);if(lesson)openLesson(lesson.id);else if(href.includes('archive'))selectTask('archive');else if(href.includes('questions'))selectTask(role==='admin'&&href.includes('admin')?'admin:support':'ai');else setNotice('이 링크는 실제 서비스에서 연결됩니다. 미리보기에서는 외부로 이동하지 않아요.');}}>
 <Suspense fallback={<p role="status">필요한 도구를 열고 있어요…</p>}>
 {review?.lessonContent && tool==='learning' && review.lessonContent}
 {review&&(isFeature(tool)||(tool==='learning'&&!review.lessonContent))&&<section className={styles.lesson}><h2>{titles[tool]}</h2>{tool==='learning'&&review.studyPreview?<Link href="/admin/campus/study">공부방 수업 미리보기 →</Link>:<><p>운영자는 수강권 없이 모든 공간을 둘러볼 수 있어요. 실제 수업·학생 기록 관리는 관리자 화면에서 진행합니다.</p><p>수강권이 있는 관리자·직원은 캠퍼스에 들어오면 바로 수강생 화면이 열립니다.</p><Link href="/campus/workspace" prefetch={false}>수강생 화면으로 →</Link> <Link href="/admin">관리자 화면으로 →</Link></>}</section>}
 {!review&&isFeature(tool)&&!['ai','office'].includes(tool)&&<FeaturePanel key={role+tool} id={tool} archive={!live||!!live.modules?.business} snapshot={snapshot} demo={demo} onRefresh={live?.onRefresh} onSelect={live?.onSelect} adminSnapshot={adminSnapshot} onOpen={openLesson} onAsk={ask} onNavigate={navigate} onNotice={setNotice}/>}
 <div hidden={tool!=='ai'}>{!review&&aiVisited&&canEnter(role,'study')&&<FeaturePanel key={role+JSON.stringify(handoff)} id="ai" demo={demo} active={tool==='ai'} snapshot={snapshot} handoff={handoff} onOpen={openLesson} onAsk={ask} onNavigate={navigate} onNotice={setNotice}/>}</div>
 <div hidden={tool!=='office'}>{!review&&officeVisited&&(!officeFilter?.jobId||tool==='office')&&canEnter(role,'office')&&<FeaturePanel key={role} officeFilter={officeFilter} id="office" demo={demo} active={tool==='office'} snapshot={snapshot} onOpen={openLesson} onAsk={ask} onNavigate={navigate} onNotice={setNotice}/>}</div>
 <div hidden={!spacePane(tool)}>{((sharedStudy&&enteredStudy)||(toolsVisited&&!sharedStudy&&(demo||room==='study')))&&canEnter(role,'study')&&<SpaceTools journal={live?!!live.modules?.focus:true} studyEntry={sharedStudy?{host:studyCardHost,onJoined:()=>setSceneStarted(true),openLounge:()=>selectTask('lounge')}:undefined} snapshot={snapshot} demo={demo} toolsVisible={!!spacePane(tool)} toolsPane={toolsPane} onOpenEnvironment={()=>{setTool('');post('environment-open');}} onOpenLesson={openLesson} onNavigate={navigate}/>}</div>
 </Suspense>
 </div>
 {room==='welcome'&&['video','notices','basics','quiz','level','checklist'].includes(tool)&&<div className={['video','notices','basics','quiz','level'].includes(tool)?undefined:styles.lesson}>{welcomeBody}</div>}

 {tool==='office-guide'&&<OfficeFirstVisit onEmployees={()=>selectTask('bots')} onInbox={()=>{setOfficeFilter(null);selectTask('office');}}/>}
 {tool==='bots'&&<>{review&&<p>운영자 연습 공간이에요. 여기서 배치한 직원은 이 브라우저에만 저장됩니다.</p>}<PersonalOffice onJobs={employee=>{setOfficeFilter({...employee});selectTask('office');}} enrollmentId={snapshot.selectedEnrollmentId||''} demo={demo} onChange={document=>post('personal-office',{document})}/><button className={styles.toolLink} onClick={()=>{setOfficeFilter(null);selectTask('office');}}>이 사무실의 업무 관리 열기 →</button></>}
 {!review&&tool==='learning'&&<LessonTaskPanel key={snapshot.selectedEnrollmentId} initialLesson={requestedLesson} live={!!live} mayLeave={mayLeave} onCompleted={live?.onRefresh} snapshot={snapshot} onOpen={openLesson}/>}
 {tool==='lesson'&&<div className={styles.lesson}><small>미리보기용 수업 안내</small><h2>{selectedLesson}</h2><p>실제 서비스에서는 해당 수강권으로 공개된 수업과 과제를 연결합니다. 이 화면은 동선 확인용 예시입니다.</p><button onClick={()=>{setTool(previous||'learning');setPrevious('');}}>수업 목록으로</button></div>}
 {tool==='intro:'+room&&canEnter(role,room)&&<article className={styles.managedArticle}><h2>{managed[room]?.title}</h2><LessonText text={managed[room]?.body||''}/></article>}
 {tool.startsWith('content:')&&canEnter(role,room)&&(()=>{const a=managed[room]?.articles.find(a=>'content:'+room+':'+a.id===tool&&a.published);return a?<article className={styles.managedArticle}><h2>{a.title}</h2>{a.image&&<img src={a.image} alt={a.imageAlt||a.title}/>}<LessonText text={a.body}/>{a.url&&<a href={a.url} target="_blank" rel="noopener noreferrer">{a.linkLabel} ↗</a>}</article>:null;})()}
 {visitor&&(['offer','experience'].includes(tool)||tool.startsWith('story:')||tool.startsWith('library:'))&&visitor.renderTool(tool,playLibraryVideo)}
 {!visitor&&tool.startsWith('library:')&&<ResourceLibrary items={welcome?.resources||live?.libraryResources} onPlay={playLibraryVideo} initial={tool==='library:all'?'all':tool==='library:replay'?'youtube':'file'}/>}
 {tool==='live-video'&&!visitor&&<div className={styles.lesson}><div className={styles.video}><video controls playsInline preload="none" src="/campus/world/tour/onboarding.mp4" aria-label="라이브홀 예시 영상"/></div><h2>라이브홀 스크린</h2><p>현재는 예시 안내 영상입니다. 실제 행사에서는 관리자가 지정한 라이브 영상을 재생합니다. 가짜 참가자 수나 실시간 방송으로 표시하지 않아요.</p></div>}
 {tool==='experience'&&!visitor&&<CustomerQuiz/>}
 {tool==='offer'&&!visitor&&<div className={styles.lesson}><small>문샷과 함께 다음 단계로</small><h2>배우고, 실행하고,<br/>나만의 결과를 만드세요.</h2><p>수업·동료 피드백·내 AI 사무실로 연결되는 교육 경험입니다.</p><div className={styles.offerActions}>{['수강 신청','커리큘럼 자세히 보기','카카오 채널 상담'].map(label=><button key={label} onClick={()=>setNotice(`${label}: 실제 행사에 등록된 링크로 연결할 자리입니다. 미리보기에서는 이동·결제하지 않습니다.`)}>{label} <ArrowUpRight size={17}/></button>)}</div></div>}
 </CampusWindow>
 </div>;
}
