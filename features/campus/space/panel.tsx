'use client';
import {createPortal} from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CampusSnapshot } from '../contracts';
import { avatarAppearance, publicAvatar, clockText, focusDeadline, peerFocusClock, cohortGoalReached, participationStatus, defaultProfile, elapsed, isWorldMessage, pauseClock, profile, resumeClock, type FocusClock, type SpacePeer, type SpaceProfile, type SpaceState } from './domain';
import {FocusJournalForm} from './focus-journal';
import { createDemoTransport, createLiveTransport, type SpaceTransport } from './transport';
import type { SpaceCommand } from './server';
import styles from './panel.module.css';
import {CampusWindow} from '../ui/campus-window';
import {shouldSendWorldState} from './world-state';
import { createAmbient,type AmbientAudio,type AmbientKind } from './audio';
import {useCampusDraftGuard} from '../ui/draft-guard';
import {BreakOrbit} from './break-orbit';
import {SPACE_CLOCK_EVENT} from './mini-focus';
import type {CommunityRewards} from '../community/domain';
import {getCommunityDemoRewards,getCommunityDemoExhibition,requestCommunityOpen} from '../community/events';
import {initialPreferences,parsePreferences,type Preferences} from '../support/domain';
const statuses={joinable:'같이 해도 좋아요',quiet:'조용히 집중',help:'도움이 필요해요',working:'작업 중'};
const zones=[['desk','문샷 집중실','한 가지에 몰입'],['mission','문샷 미션실','일차별 작은 실행'],['board','문샷 의견 나눔방','동료의 시선'],['chat','문샷 라운지','가벼운 대화'],['terrace','문샷 테라스','잠깐의 여백'],['launch','문샷 발사대','다음 도약']] as const;
const emptyClock:FocusClock={phase:'idle',duration:0,elapsed:0,runningSince:null};
export function SpacePanel({snapshot,demo,journal=false,studyEntry,onOpenLesson,onNavigate,onOpenEnvironment,rewards,immersive=false,spatial=false,blocked=false,toolsPane,initialRenderer='office',toolsVisible=true}:{snapshot:CampusSnapshot;demo:boolean;journal?:boolean;studyEntry?:{host:HTMLElement|null;openLounge:()=>void;onJoined:()=>void};toolsPane?:'focus'|'lounge'|'settings'|'profile';initialRenderer?:'classic'|'office';toolsVisible?:boolean;immersive?:boolean;spatial?:boolean;blocked?:boolean;onOpenLesson?:(id:string)=>void;onOpenEnvironment?:()=>void;onNavigate?:(section:string)=>void;rewards?:CommunityRewards|null}){
 const scope=snapshot.scopes.find(s=>s.enrollmentId===snapshot.selectedEnrollmentId),cohortId=scope?.cohortId;
 const [toolsOpen,setToolsOpen]=useState(false);
 const [renderer,setRenderer]=useState<'classic'|'office'>(initialRenderer);
 const [exhibition,setExhibition]=useState<Array<{id:string;title:string;alias:string}>>([]);
 const [demoSession,setDemoSession]=useState<{sessionId:string;postId:string;title:string}|null>(null);
 const [participation,setParticipation]=useState<Preferences['mode']>('quiet'),[modeLoaded,setModeLoaded]=useState(false),[nearDraft,setNearDraft]=useState('');
 const [loadedRewards,setLoadedRewards]=useState<CommunityRewards|null>(null);const progress=demo?(rewards||loadedRewards):loadedRewards;
 const [token,setToken]=useState(''),[sessionId,setSessionId]=useState(''),[localPane,setPane]=useState<'focus'|'lounge'|'profile'|'settings'|'directory'>('focus');
 const pane=toolsPane||localPane;
 const [active,setActive]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[journaling,setJournaling]=useState<number|null>(null),[worldReady,setWorldReady]=useState(false);
 const [slowWorld,setSlowWorld]=useState(false);
 const [pending,setPending]=useState<'foreground'|'auto-entry'|null>(null);
 const busy=pending!==null;
 const [draft,setDraft]=useState<SpaceProfile>(()=>defaultProfile(snapshot.viewer.displayName)),[saved,setSaved]=useState<SpaceProfile>(()=>defaultProfile(snapshot.viewer.displayName));
 const [state,setState]=useState<SpaceState|null>(null),[text,setText]=useState(''),[clock,setClock]=useState<FocusClock>(emptyClock),[now,setNow]=useState(Date.now),[duration,setDuration]=useState(25),[compact,setCompact]=useState(false),[photo,setPhoto]=useState('');
 useEffect(()=>{if(toolsPane||compact||worldReady)return;const timer=setTimeout(()=>setSlowWorld(true),12000);return()=>clearTimeout(timer);},[compact,worldReady,renderer,toolsPane]);
 useCampusDraftGuard(JSON.stringify({...draft,status:saved.status})!==JSON.stringify(saved),pending==='foreground','campus-space',toolsVisible);
 useEffect(()=>{const changed=(e:Event)=>{const d=(e as CustomEvent).detail;if(!demo&&d?.cohortId===cohortId){const a=publicAvatar(d.appearance);setSaved(p=>({...p,...a}));setDraft(p=>({...p,...a}));}};window.addEventListener('campus:avatar-saved',changed);return()=>window.removeEventListener('campus:avatar-saved',changed);},[demo,cohortId]);
 const [sound,setSound]=useState<AmbientKind|null>(null),[volume,setVolume]=useState(25);const audio=useRef<AmbientAudio|null>(null),soundGeneration=useRef(0);
 const frame=useRef<HTMLIFrameElement>(null),transport=useRef<SpaceTransport|null>(null),current=useRef({saved,clock,active,progress,space:state}),operation=useRef(false),mounted=useRef(true),actions=useRef<{seat:()=>void;navigate:(s:string)=>void;saveAppearance:(p:unknown)=>void}>({seat:()=>{},navigate:()=>{},saveAppearance:()=>{}});
 useEffect(()=>{current.current={saved,clock,active,progress,space:state};},[saved,clock,active,progress,state]);
 const chatList=useRef<HTMLDivElement>(null);
 const followingChat=useRef(true);
 const chatVisible=pane==='lounge'&&(toolsPane?toolsVisible:!spatial||toolsOpen);
 const latestMessage=state?.messages.at(-1)?.id;
 useEffect(()=>{
  // Opening the lounge and returning to it both reconcile against the stored messages.
  const update=()=>transport.current?.setChatVisible?.(chatVisible&&!document.hidden&&navigator.onLine);
  update();
  document.addEventListener('visibilitychange',update);
  window.addEventListener('offline',update);
  window.addEventListener('online',update);
  return ()=>{
   document.removeEventListener('visibilitychange',update);
   window.removeEventListener('offline',update);
   window.removeEventListener('online',update);
  };
 },[chatVisible,active]);
 useLayoutEffect(()=>{
  if(!chatVisible){followingChat.current=true;return;}
  const list=chatList.current;
  if(list&&followingChat.current)list.scrollTop=list.scrollHeight;
 },[chatVisible,latestMessage]);
 const triedStudyEntry=useRef(false);
 const joinedSession=useRef(false);
 const lastSpeech=useRef('');
 const sittingRef=useRef(false),previousSeat=useRef<string|null>(null);
 const sessionRef=useRef(sessionId);useEffect(()=>{sessionRef.current=sessionId;},[sessionId]);
 const clockKey=`moonshot-space-clock:${demo?'demo':'live'}:${snapshot.viewer.id}:${cohortId}`;
 const worldState=useRef(new Map<string,string>());
 const post=useCallback((type:string,payload:Record<string,unknown>={})=>{const target=frame.current?.contentWindow;if(token&&target&&shouldSendWorldState(worldState.current,type,payload))target.postMessage({source:'moonshot-host',token,type,payload},window.location.origin);},[token]);
 function openEnvironment(){if(onOpenEnvironment){onOpenEnvironment();return;}frame.current?.scrollIntoView({block:'center'});setToolsOpen(false);post('environment-open');}
 const command=useCallback(async(cmd:Partial<SpaceCommand>&{kind:string})=>{if(!transport.current)throw new Error('먼저 캠퍼스에 입장해 주세요.');return transport.current.command(cmd);},[]);
 function statusError(e:unknown){setError(e instanceof Error?e.message:'공간 연결을 확인하지 못했습니다.');}
 async function act(fn:()=>Promise<void>,kind:'foreground'|'auto-entry'='foreground'){if(operation.current)return;operation.current=true;setPending(kind);setError('');try{await fn();}catch(e){statusError(e);}finally{operation.current=false;if(mounted.current)setPending(null);}}
 useEffect(()=>{mounted.current=true;queueMicrotask(()=>{if(mounted.current){setToken(crypto.randomUUID());setSessionId(crypto.randomUUID());}});return()=>{mounted.current=false;void audio.current?.stop();transport.current?.close();transport.current=null;};},[]);
 useEffect(()=>{if(!cohortId)return;let ignore=false;transport.current?.close();transport.current=null;queueMicrotask(()=>{if(!ignore){setActive(false);setState(null);setWorldReady(false);setError('');}});
  try{const raw=JSON.parse(sessionStorage.getItem(clockKey)||'null');if(raw&&['idle','focus','break'].includes(raw.phase)&&Number.isInteger(raw.duration)&&raw.duration>=0&&raw.duration<=3000&&Number.isFinite(raw.elapsed)&&raw.elapsed>=0&&(raw.runningSince===null||Number.isFinite(raw.runningSince)))queueMicrotask(()=>{if(!ignore)setClock(raw);});else queueMicrotask(()=>{if(!ignore)setClock(emptyClock);});}catch{queueMicrotask(()=>{if(!ignore)setClock(emptyClock);});}
  if(demo){try{const p=profile(JSON.parse(localStorage.getItem(`moonshot-space-demo-profile:${snapshot.viewer.id}`)||'null'),snapshot.viewer.displayName);queueMicrotask(()=>{if(!ignore){setDraft(p);setSaved(p);setCompact(p.lowMotion||matchMedia('(prefers-reduced-motion: reduce)').matches);}});}catch{queueMicrotask(()=>{if(!ignore){setDraft(defaultProfile(snapshot.viewer.displayName));setSaved(defaultProfile(snapshot.viewer.displayName));}});}}
  else void fetch(`/api/campus/space?cohortId=${encodeURIComponent(cohortId)}`,{cache:'no-store',credentials:'same-origin'}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);return data as SpaceState;}).then(data=>{if(!ignore){setState(data);setDraft(data.profile);setSaved(data.profile);setCompact(data.profile.lowMotion||matchMedia('(prefers-reduced-motion: reduce)').matches);}}).catch(e=>{if(!ignore)statusError(e);});
  return()=>{ignore=true;if(!demo&&(joinedSession.current||current.current.active)&&sessionRef.current)void fetch('/api/campus/space',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'leave',cohortId,sessionId:sessionRef.current}),keepalive:true,credentials:'same-origin'}).catch(()=>{});transport.current?.close();transport.current=null;};
 },[cohortId,clockKey,demo,snapshot.viewer.id,snapshot.viewer.displayName]);
 useEffect(()=>{try{sessionStorage.setItem(clockKey,JSON.stringify(clock));if(!demo&&clock.phase!=='idle')sessionStorage.setItem('moonshot-active-focus:live',JSON.stringify({viewerId:snapshot.viewer.id,enrollmentId:snapshot.selectedEnrollmentId}));window.dispatchEvent(new CustomEvent(SPACE_CLOCK_EVENT,{detail:{key:clockKey}}));}catch{/* Ephemeral timer remains available. */}},[clockKey,clock,demo,snapshot.viewer.id,snapshot.selectedEnrollmentId]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(clock.runningSince!==null&&clock.duration>0&&elapsed(clock,now)>=clock.duration){queueMicrotask(()=>{setClock(c=>({...pauseClock(c,now),elapsed:c.duration}));setNotice(clock.phase==='break'?'휴식이 끝났어요. 준비되면 다시 시작하세요.':'집중 시간이 끝났어요. 오늘 한 일을 메모하고 잠깐 쉬어가세요.');});}},[clock,now]);
 useEffect(()=>{post('ui-blocked',{blocked:blocked||(spatial&&toolsOpen)});},[blocked,spatial,toolsOpen,post,worldReady]);
 useEffect(()=>{post('progress',{level:progress?.level??null,xp:progress?.xp??null,launched:!!progress?.claimedAt,cohortLaunches:progress?.cohortLaunches??null,cohortGoal:progress?.cohortGoal??null,demo});},[progress,post,worldReady,demo]);
 useEffect(()=>{const read=()=>{try{const raw=JSON.parse(sessionStorage.getItem(clockKey)||'null');if(raw&&['idle','focus','break'].includes(raw.phase))setClock(old=>JSON.stringify(old)===JSON.stringify(raw)?old:raw);}catch{}};window.addEventListener(SPACE_CLOCK_EVENT,read);return()=>window.removeEventListener(SPACE_CLOCK_EVENT,read);},[clockKey]);
 const focusDone=clock.phase==='focus'&&clock.duration>0&&elapsed(clock,now)>=clock.duration;
 useEffect(()=>{post('focus-status',{done:focusDone});},[focusDone,post,worldReady]);
 useEffect(()=>{post('presentation',{session:demoSession});},[demoSession,post,worldReady]);
 useEffect(()=>{post('exhibition',{items:exhibition,demo});},[exhibition,post,worldReady,demo]);
 useEffect(()=>{post('controls',{closedZones:state?.controls?.closedZones||[]});},[state?.controls?.closedZones,post,worldReady]);
 useEffect(()=>{post('profile',{...avatarAppearance(saved),name:saved.nickname,gender:saved.gender,coat:saved.coat,accessory:saved.accessory,deskTheme:saved.deskTheme});},[saved,post,worldReady]);
 useEffect(()=>{const actor=demo?sessionId:snapshot.viewer.id;post('peers',{items:(state?.peers||[]).filter(p=>p.userId!==actor).map(p=>({...avatarAppearance(p),id:p.userId,name:p.nickname,gender:p.gender,coat:p.coat,accessory:p.accessory,x:p.x,y:p.y,sitting:p.sitting,wave:p.wave}))});},[state,post,demo,sessionId,snapshot.viewer.id,worldReady]);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{if(!isWorldMessage(event,location.origin,frame.current?.contentWindow,token))return;const d=event.data;
   if(d.type==='boot'){post('init');return;}if(d.type==='ready'){worldState.current.clear();setWorldReady(true);const latest=current.current;post('profile',{...avatarAppearance(latest.saved),name:latest.saved.nickname,gender:latest.saved.gender,coat:latest.saved.coat,accessory:latest.saved.accessory,deskTheme:latest.saved.deskTheme});post('progress',{level:latest.progress?.level??null,xp:latest.progress?.xp??null,launched:!!latest.progress?.claimedAt,cohortLaunches:latest.progress?.cohortLaunches??null,cohortGoal:latest.progress?.cohortGoal??null,demo});const heldSeat=latest.space?.seats.find(s=>s.userId===(demo?sessionId:snapshot.viewer.id));if(heldSeat)post('seat',{index:Number(heldSeat.id.slice(-1))-1});post('peers',{items:(latest.space?.peers||[]).filter(p=>p.userId!==(demo?sessionId:snapshot.viewer.id)).map(p=>({...avatarAppearance(p),id:p.userId,name:p.nickname,gender:p.gender,coat:p.coat,accessory:p.accessory,x:p.x,y:p.y,sitting:p.sitting,wave:p.wave}))});return;}
   if(d.type==='appearance-draft'){setDraft(p=>({...p,...publicAvatar(d.payload)}));return;}
   if(d.type==='appearance-cancel'){setDraft(p=>({...p,...publicAvatar(current.current.saved)}));return;}
   if(d.type==='appearance-save'){actions.current.saveAppearance(d.payload);return;}
   if(d.type==='position'){transport.current?.move(d.payload);const held=state?.seats.some(s=>s.userId===(demo?sessionId:snapshot.viewer.id));if(held&&sittingRef.current&&d.payload?.sitting===false){sittingRef.current=false;void command({kind:'stand'}).catch(statusError);}else if(held&&d.payload?.sitting===true)sittingRef.current=true;}
   if(d.type==='wave'){const own=state?.peers.find(p=>p.userId===(demo?sessionId:snapshot.viewer.id));transport.current?.move({x:own?.x||12,y:own?.y||8.8,sitting:own?.sitting||false,wave:true});}
   if(d.type==='navigate')actions.current.navigate(String(d.payload?.section||''));if(d.type==='seat')actions.current.seat();
   if(d.type==='photo'&&typeof d.payload?.url==='string'&&d.payload.url.startsWith('data:image/png;base64,')&&d.payload.url.length<12000000)setPhoto(d.payload.url);
   if(d.type==='error'){setCompact(true);setNotice('가벼운 공간 메뉴로 계속 사용할 수 있어요.');}
  };window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[token,post,state,demo,sessionId,snapshot.viewer.id,command]);
 useEffect(()=>{if(!active)return;
  let running=false;
  const beat=async()=>{if(running||operation.current||(!demo&&!navigator.onLine))return;running=true;const connection=transport.current;try{const c=current.current.clock;const end=focusDeadline(c);await command({kind:'heartbeat',profile:current.current.saved,focusUntil:end!==null&&end>Date.now()?new Date(end).toISOString():null,focusMode:c.phase==='focus'?Math.round(c.duration/60):0});}catch(e){
   if(!connection||transport.current!==connection)return;
   // A suspended radio can fail a heartbeat before the browser reports offline.
   // Keep the session so the next heartbeat can retry. Server rejections still end it.
   if(e instanceof TypeError)return;
   statusError(e);setActive(false);connection.close();transport.current=null;
  }finally{running=false;}};
  const timer=setInterval(beat,15000);const unload=()=>{if(!demo)void fetch('/api/campus/space',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'leave',cohortId,sessionId}),keepalive:true,credentials:'same-origin'}).catch(()=>{});transport.current?.close();};window.addEventListener('pagehide',unload);
  return()=>{clearInterval(timer);window.removeEventListener('pagehide',unload);};
 },[active,command,cohortId,sessionId,demo]);
 async function selectSound(kind:AmbientKind|null){const generation=++soundGeneration.current;const previous=audio.current;audio.current=null;setSound(null);await previous?.stop();if(kind){try{const next=await createAmbient(kind,volume);if(!mounted.current||generation!==soundGeneration.current){await next.stop();return;}audio.current=next;setSound(kind);}catch{if(mounted.current)setError('소리를 재생할 수 없는 브라우저입니다.');}}}
 useEffect(()=>{const enrollmentId=snapshot.selectedEnrollmentId;if(!enrollmentId)return;let stopped=false,inflight=false;const controller=new AbortController();
  async function load(){if(inflight||stopped||document.hidden)return;if(demo){setLoadedRewards(getCommunityDemoRewards(enrollmentId!));return;}inflight=true;try{const r=await fetch('/api/campus/community/rewards?enrollmentId='+encodeURIComponent(enrollmentId!),{cache:'no-store',credentials:'same-origin',signal:controller.signal});const data=await r.json();if(!stopped)setLoadedRewards(r.ok&&Number.isSafeInteger(data.xp)&&data.xp>=0&&Number.isSafeInteger(data.level)&&data.level>0&&typeof data.ruleVersion==='string'?data:null);}catch{if(!stopped)setLoadedRewards(null);}finally{inflight=false;}}
  void load();const changed=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.enrollmentId===enrollmentId&&d.demo===demo)void load();};window.addEventListener('campus:community-changed',changed);const refresh=setInterval(()=>void load(),60000);const visible=()=>void load();document.addEventListener('visibilitychange',visible);return()=>{stopped=true;controller.abort();clearInterval(refresh);document.removeEventListener('visibilitychange',visible);window.removeEventListener('campus:community-changed',changed);};
 },[snapshot.selectedEnrollmentId,demo]);

 useEffect(()=>{const enrollment=snapshot.selectedEnrollmentId;if(!enrollment)return;let stop=false;const key='campus-demo-support-v1:'+snapshot.viewer.id+':'+enrollment;
  async function loadMode(){try{let prefs:Preferences;if(demo){const raw=JSON.parse(localStorage.getItem(key)||'null');prefs=raw?.preferences?parsePreferences(raw.preferences):initialPreferences;}else{const r=await fetch('/api/campus/support?scope='+encodeURIComponent(enrollment!),{cache:'no-store',credentials:'same-origin'});if(!r.ok)return;prefs=parsePreferences((await r.json()).preferences);}if(!stop){setParticipation(prefs.mode);setModeLoaded(true);const status=participationStatus(prefs.mode);setDraft(p=>({...p,status}));setSaved(p=>({...p,status}));}}catch{/* Keep mode unavailable instead of inventing a saved preference. */}}
  void loadMode();const changed=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.enrollmentId===enrollment&&d.demo===demo)void loadMode();};window.addEventListener('campus:support-preferences-changed',changed);return()=>{stop=true;window.removeEventListener('campus:support-preferences-changed',changed);};
 },[demo,snapshot.selectedEnrollmentId,snapshot.viewer.id]);
 async function changeParticipation(mode:Preferences['mode']){await act(async()=>{const enrollment=snapshot.selectedEnrollmentId;if(!enrollment)return;if(demo){const key='campus-demo-support-v1:'+snapshot.viewer.id+':'+enrollment;const prior=JSON.parse(localStorage.getItem(key)||'null')||{requests:[],actions:[],sessions:[],bookings:[],preferences:{...initialPreferences,knownLessons:{}},serverNow:new Date().toISOString()};prior.preferences={...prior.preferences,mode};localStorage.setItem(key,JSON.stringify(prior));}else{const r=await fetch('/api/campus/support',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'participation-mode',enrollmentId:enrollment,mode})});if(!r.ok)throw Error((await r.json()).error||'참여 방식을 저장하지 못했습니다.');}const next={...saved,status:participationStatus(mode)};setSaved(next);setDraft(p=>({...p,status:next.status}));setParticipation(mode);if(active)await command({kind:'profile',profile:next});window.dispatchEvent(new CustomEvent('campus:support-preferences-changed',{detail:{enrollmentId:enrollment,demo}}));setNotice('참여 방식을 저장했어요. 지원실 설정에도 함께 반영됩니다.');});}
 useEffect(()=>{if(!state?.controls?.paused||!active)return;queueMicrotask(()=>{transport.current?.close();transport.current=null;setActive(false);post('stand');post('peers',{items:[]});setNotice('운영자가 공간을 잠시 쉬게 했어요. 나의 집중 시간은 그대로 이어집니다.');});},[state?.controls?.paused,active,post]);
 async function refreshRoom(){await act(async()=>{if(demo)return;const r=await fetch('/api/campus/space?cohortId='+encodeURIComponent(cohortId!),{cache:'no-store',credentials:'same-origin'});const data=await r.json();if(!r.ok)throw Error(data.error);setState(data);setNotice('공간 운영 상태를 확인했어요.');});}
 async function takeSeat(id:string){await act(async()=>{await command({kind:'seat',seatId:id});post('seat',{index:Number(id.slice(-1))-1});setPane('focus');setNotice('자리를 잡았어요. 준비되면 집중을 시작하세요.');});}

 useEffect(()=>{if(demo||!snapshot.selectedEnrollmentId)return;let ignore=false,inflight=false;const controller=new AbortController();const read=async()=>{if(ignore||inflight||document.hidden)return;inflight=true;try{const r=await fetch('/api/campus/community/demo-session?enrollmentId='+encodeURIComponent(snapshot.selectedEnrollmentId!),{credentials:'same-origin',cache:'no-store',signal:controller.signal});const data=r.ok?await r.json():null;if(!ignore)setDemoSession(data?.session?.status==='presenting'&&typeof data.session.postId==='string'&&typeof data.session.sessionId==='string'?{postId:data.session.postId,sessionId:data.session.sessionId,title:String(data.session.title||'문샷 발표').slice(0,120)}:null);}catch{if(!ignore)setDemoSession(null);}finally{inflight=false;}};void read();const timer=setInterval(read,30000);document.addEventListener('visibilitychange',read);return()=>{ignore=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',read);};},[demo,snapshot.selectedEnrollmentId]);
 useEffect(()=>{const enrollment=snapshot.selectedEnrollmentId;if(!enrollment)return;const controller=new AbortController();let stop=false,inflight=false;const load=async()=>{if(stop||inflight||document.hidden)return;if(demo){setExhibition(getCommunityDemoExhibition(enrollment));return;}inflight=true;try{const r=await fetch('/api/campus/community/exhibition?enrollmentId='+encodeURIComponent(enrollment),{cache:'no-store',credentials:'same-origin',signal:controller.signal});const data=r.ok?await r.json():null;const items=Array.isArray(data?.items)?data.items.filter((p:{id?:unknown;title?:unknown;alias?:unknown})=>typeof p.id==='string'&&typeof p.title==='string'&&typeof p.alias==='string').slice(0,6).map((p:{id:string;title:string;alias:string})=>({id:p.id,title:p.title.slice(0,120),alias:p.alias.slice(0,24)})):[];if(!stop)setExhibition(items);}catch{if(!stop)setExhibition([]);}finally{inflight=false;}};void load();const timer=setInterval(load,60000);const changed=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.enrollmentId===enrollment&&d.demo===demo)void load();};window.addEventListener('campus:community-changed',changed);document.addEventListener('visibilitychange',load);return()=>{stop=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);window.removeEventListener('campus:community-changed',changed);};},[demo,snapshot.selectedEnrollmentId]);
 function openExhibit(id:string){if(!snapshot.selectedEnrollmentId||!exhibition.some(p=>p.id===id)||state?.controls?.closedZones?.includes('board'))return;requestCommunityOpen({enrollmentId:snapshot.selectedEnrollmentId,tab:'all',postId:id});onNavigate?.('community');}
 function openDemoDay(){if(!snapshot.selectedEnrollmentId||state?.controls?.closedZones?.includes('board'))return;requestCommunityOpen({enrollmentId:snapshot.selectedEnrollmentId,tab:'demo_day',...(demoSession?{postId:demoSession.postId,sessionId:demoSession.sessionId}:{})});onNavigate?.('community');}
 const actor=demo?sessionId:snapshot.viewer.id,ownSeat=state?.seats.find(s=>s.userId===actor);
 useEffect(()=>{const latest=state?.nearby?.at(-1);if(latest&&latest.id!==lastSpeech.current){lastSpeech.current=latest.id;post('speech',{id:latest.userId===actor?'self':latest.userId,text:latest.text});}},[state?.nearby,actor,post]);
 useEffect(()=>{post('desk-seat',{index:ownSeat?Number(ownSeat.id.slice(-1))-1:0});},[ownSeat,post,worldReady]);
 useEffect(()=>{if(previousSeat.current&&!ownSeat&&active){post('stand');sittingRef.current=false;setNotice('자리 이용이 끝났어요. 자리를 다시 고를 수 있습니다.');}previousSeat.current=ownSeat?.id||null;},[ownSeat,active,post]);
 useEffect(()=>{actions.current.saveAppearance=(value)=>{if(operation.current||!current.current.active){post('appearance-result',{ok:false,error:'캠퍼스에 입장한 뒤 저장해 주세요.'});return;}void act(async()=>{try{const appearance=publicAvatar(value),next={...current.current.saved,...appearance};await command({kind:'profile',profile:next});setSaved(next);setDraft(p=>({...p,...appearance}));post('appearance-result',{ok:true});setNotice('캐릭터를 저장했어요. 다음 입장에도 같은 모습으로 만나요.');}catch(e){post('appearance-result',{ok:false,error:'저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.'});throw e;}});};actions.current.navigate=(s)=>{if(['chat','crew','profile','desk','questfocus','terrace','settings'].includes(s))setToolsOpen(true);if(s.startsWith('exhibit:')){openExhibit(s.slice(8));return;}const zone=s==='presentation'?'board':s==='curriculum'?'mission':s;if(state?.controls?.closedZones?.includes(zone)){setNotice('이 공간은 잠시 쉬고 있어요. 다른 공간을 선택해 주세요.');return;}if(['chat','crew'].includes(s)){setPane('lounge');return;}if(s==='settings'){setPane('settings');return;}if(s==='profile'){setPane('profile');return;}if(['desk','questfocus','terrace','settings'].includes(s)){setPane('focus');return;}if(['ai','business','support','journal'].includes(s)){onNavigate?.(s);return;}if(s==='presentation'){openDemoDay();return;}if(s==='office'){onNavigate?.('office');return;}if(['board','detail','newpost'].includes(s))onNavigate?.('community');else if(['curriculum','resources','mission','missionmap','launch','achievements'].includes(s))onNavigate?.('learning');};
 actions.current.seat=()=>{setToolsOpen(true);setPane('focus');if(state?.controls?.closedZones?.includes('desk')){setNotice('집중석 신규 이용은 잠시 쉬고 있어요. 개인 타이머는 사용할 수 있습니다.');return;}if(!active){setNotice('입장한 뒤 빈자리를 선택해 주세요.');return;}const seat=['desk-1','desk-2','desk-3'].find(id=>!state?.seats.some(s=>s.id===id&&s.userId!==actor));if(seat)void takeSeat(seat);else setNotice('집중석이 모두 사용 중이에요. 자유 집중은 바로 시작할 수 있어요.');};});
 async function join(kind:'foreground'|'auto-entry'='foreground'){await act(async()=>{
  if(!cohortId)return;
  if(studyEntry)triedStudyEntry.current=true;
  const entering={...saved,status:participationStatus(participation)};
  setSaved(entering);setDraft(p=>({...p,status:entering.status}));
  transport.current?.close();
  const t=demo?createDemoTransport(cohortId,snapshot.viewer.id,sessionId,entering,setState):await createLiveTransport(cohortId,snapshot.viewer.id,sessionId,setState,setError);
  if(!mounted.current){t.close();return;}
  transport.current=t;
  try{
   await t.command({kind:'join',profile:entering});
   if(!mounted.current||transport.current!==t){
    if(!demo)await fetch('/api/campus/space',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'leave',cohortId,sessionId}),keepalive:true});
    return;
   }
   joinedSession.current=true;
   studyEntry?.onJoined();
   setActive(true);setNotice(toolsPane?'':'입장했어요. 이동하거나 원하는 공간을 골라 보세요.');
  }catch(e){t.close();if(transport.current===t)transport.current=null;throw e;}
 },kind);}
 useEffect(()=>{
  if(!studyEntry||!sessionId||!state||state.controls?.paused||triedStudyEntry.current||busy)return;
  triedStudyEntry.current=true;
  void join('auto-entry');
 });
 async function leave(){await act(async()=>{await command({kind:'leave'});joinedSession.current=false;transport.current?.close();transport.current=null;setActive(false);post('stand');post('peers',{items:[]});setNotice('공간에서 나왔어요. 집중 타이머와 내 메모는 유지됩니다.');});}
 async function celebrateCohort(){await act(async()=>{let verified=progress;if(!demo){const r=await fetch('/api/campus/community/rewards?enrollmentId='+encodeURIComponent(snapshot.selectedEnrollmentId!),{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw Error('기수 목표 달성을 다시 확인하지 못했어요.');verified=await r.json() as CommunityRewards;setLoadedRewards(verified);}if(!cohortGoalReached(verified))throw Error('기수 공동 목표를 달성하면 기념 연출을 볼 수 있어요.');if(state?.controls?.paused||state?.controls?.closedZones?.includes('launch'))return;post('progress',{level:verified!.level,xp:verified!.xp,launched:!!verified!.claimedAt,cohortLaunches:verified!.cohortLaunches,cohortGoal:verified!.cohortGoal,demo});post('cohort-launch');setNotice((demo?'체험 · ':'')+'확인된 기수 공동 목표 달성을 축하합니다. 기념 연출이며 새 발사 기록이나 성장 점수를 만들지 않아요.');});}
 function startFocus(minutes:number){setClock({phase:'focus',duration:minutes*60,elapsed:0,runningSince:Date.now()});setNotice(minutes?`${minutes}분 동안 한 가지에 집중해요.`:'시간 제한 없이 내 속도로 집중해요.');}

 function joinFocus(peer:SpacePeer,joinedAt:number){
  const latest=current.current.space?.peers.find(p=>p.userId===peer.userId&&p.sessionId===peer.sessionId);
  const next=latest&&peerFocusClock(latest,joinedAt);
  if(!active||!next||latest.userId===actor)return;
  setClock(next);
  setNotice(latest.nickname+'님과 같은 시간에 집중을 마쳐요.');
 }
 const ownDeadline=focusDeadline(clock);
 useEffect(()=>{if(active)transport.current?.setFocusDeadline?.(ownDeadline);},[active,ownDeadline]);
 function focusAction(peer:SpacePeer, forRoster:boolean){
  const shared=peerFocusClock(peer,now);
  if(!shared)return null;
  const aligned=ownDeadline===focusDeadline(shared);
  return <div className={forRoster?styles.rosterFocus:styles.group}>
   <span>{!forRoster&&peer.nickname+' · '}집중 중 · <time>{clockText(shared,now)}</time> 남음</span>
   {aligned?<span>함께 집중 중</span>:<button type="button" disabled={!active||busy} onClick={()=>joinFocus(peer,Date.now())}>
    {ownDeadline&&ownDeadline>now?'내 타이머 전환':forRoster?'함께하기':'남은 시간 함께하기'}
   </button>}
  </div>;
 }
 const tools=<>
   <div hidden={!!toolsPane} className={styles.tabs} role="tablist" aria-label="공간 도구">{(['focus','lounge','profile'] as const).map((tab,i)=><button role="tab" aria-selected={pane===tab} key={tab} onClick={()=>setPane(tab)}>{['집중과 휴식','라운지','내 자리'][i]}</button>)}</div>
   {pane==='focus'&&<div className={styles.content} data-desk-theme={saved.deskTheme}>
    <h3>오늘은 무엇을 만들까요?</h3>{spatial&&!active&&<button className={styles.primary} disabled={busy||!!state?.controls?.paused} onClick={()=>void join()}>캠퍼스에 입장하기</button>}<p>{saved.desk||'한 번에 한 가지, 작게 시작해요.'}</p>
    <p className={styles.caption}>자리를 고르면 공부방에서 내 캐릭터가 그 책상에 앉아요. 앉지 않아도 타이머는 쓸 수 있어요.</p><div className={styles.seats} aria-label="집중석">{['desk-1','desk-2','desk-3'].map((id,i)=>{const seat=state?.seats.find(s=>s.id===id),mine=seat?.userId===actor;return <button key={id} disabled={!active||busy||!!seat&&!mine||state?.controls?.closedZones?.includes('desk')} onClick={()=>void takeSeat(id)}>{i+1}번 자리{mine?' · 내 자리':seat?' · 사용 중':'에 앉기'}</button>;})}</div>
    {ownSeat&&<button className={styles.link} disabled={busy} onClick={()=>void act(async()=>{await command({kind:'stand'});post('stand');})}>자리에서 일어나기</button>}
    <div className={styles.timer}><span>{clock.phase==='break'?'잠깐의 여백':clock.phase==='focus'?'나의 집중 시간':'준비되면 시작해요'}</span><strong aria-label="집중 타이머">{clock.phase==='idle'?`${duration?duration:'00'}:00`:clockText(clock,now)}</strong><small>페이지를 숨겨도 시간은 이어집니다.</small></div>
    <label className={styles.field}>집중 시간<select aria-label="집중 시간" value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value={25}>25분</option><option value={50}>50분</option><option value={0}>자유 집중</option></select></label>
    <div className={styles.controls}>{clock.phase==='idle'||clock.duration>0&&elapsed(clock,now)>=clock.duration?<button className={styles.primary} onClick={()=>startFocus(duration)}>집중 시작</button>:<button className={styles.primary} onClick={()=>setClock(c=>c.runningSince===null?resumeClock(c):pauseClock(c))}>{clock.runningSince===null?'이어서 집중':'잠시 멈추기'}</button>}<button onClick={()=>{const spent=clock.phase==='focus'?Math.round(elapsed(clock,Date.now())/60):null;setClock(emptyClock);if(journal&&spent!==null){setJournaling(spent);setNotice('');}else setNotice('집중을 마무리했어요.');}}>마무리</button></div>
    {journaling!==null&&<FocusJournalForm snapshot={snapshot} demo={demo} minutes={journaling} onSkip={()=>setJournaling(null)} onSaved={()=>{setJournaling(null);setNotice('실행 수첩에 저장했어요.');}}/>}
    <div className={styles.controls}>{[3,5].map(m=><button key={m} onClick={()=>setClock({phase:'break',duration:m*60,elapsed:0,runningSince:Date.now()})}>{m}분 쉬기</button>)}</div>
    <details className={styles.ambient}><summary>나만의 30초 쉬기</summary><BreakOrbit/></details>
    {(state?.peers||[]).filter(p=>p.userId!==actor&&peerFocusClock(p,now)).slice(0,3).map(p=><div key={p.userId}>{focusAction(p,false)}</div>)}
   </div>}
   {pane==='lounge'&&<div className={styles.content}>{!toolsPane&&<section className={styles.nearby} aria-label="가까운 동료 대화"><h3>가까운 동료에게 한마디</h3><p className={styles.caption}>주변 4칸 안 동료에게 잠깐 보여요. 같은 기수로 전달되는 위치 기반 대화이며 비공개 DM은 아닙니다. 12초 뒤 화면에서 사라지고 저장하지 않아요.</p>{participation==='quiet'?<p>조용히 집중 중에는 근처 대화를 받거나 보내지 않아요.</p>:<><div>{state?.nearby?.filter(m=>now-m.at<12000).map(m=><p key={m.id}><strong>{m.nickname}</strong> {m.text}</p>)}</div><div className={styles.controls}>{['👋 안녕하세요','👏 응원해요','🙏 고마워요'].map(text=><button disabled={!active||busy} key={text} onClick={()=>void act(async()=>{await command({kind:'emote',text});post('wave');})}>{text}</button>)}</div><form onSubmit={e=>{e.preventDefault();void act(async()=>{await command({kind:'nearby',text:nearDraft});setNearDraft('');});}}><label className={styles.field}>근처 한마디<input aria-label="근처 한마디" value={nearDraft} maxLength={120} onChange={e=>setNearDraft(e.target.value)}/></label><button disabled={!active||busy||!nearDraft.trim()}>근처에 보내기</button></form></>}</section>}<h3>함께 있는 동료</h3><div role="group" aria-label="함께 있는 동료" className={styles.peerList}>{(state?.peers||[]).map(p=><div key={p.userId}><span className={styles.dot} style={{background:p.coat}}/><strong>{p.nickname}{p.userId===actor?' · 나':''}</strong><small>{statuses[p.status]}</small></div>)}{!state?.peers.length&&<p>먼저 입장해 보세요. 연결된 동료만 여기에 나타납니다.</p>}</div><p className={styles.caption}>기수 안에서만 보이는 대화입니다. 최근 24시간, 최대 60개를 표시해요. 개인정보는 적지 마세요.</p><div ref={chatList} className={styles.chat} aria-label="라운지 대화" onScroll={event=>{
     const list=event.currentTarget;
     followingChat.current=list.scrollHeight-list.clientHeight-list.scrollTop<=16;
    }}>{(state?.messages||[]).map(m=><article key={m.id}><small>{m.nickname}</small><p>{m.text}</p>{m.userId===actor&&<button disabled={busy} onClick={()=>void act(async()=>{await command({kind:'delete-chat',messageId:m.id});})}>내 메시지 삭제</button>}</article>)}</div><form onSubmit={e=>{e.preventDefault();void act(async()=>{await command({kind:'chat',messageId:crypto.randomUUID(),text});setText('');});}}><label className={styles.field}>라운지 메시지<textarea disabled={state?.controls?.closedZones?.includes('chat')} aria-label="라운지 메시지" value={text} maxLength={300} onChange={e=>setText(e.target.value)} placeholder="오늘 어떤 작업을 하고 있나요?"/></label><button className={styles.primary} disabled={!active||busy||!text.trim()}>보내기</button></form></div>}
   {pane==='profile'&&<div className={styles.content}><h3>나의 문샷 동료</h3>{renderer==='office'&&!toolsPane&&<><button disabled={!worldReady||compact} onClick={()=>{post('appearance-open');setToolsOpen(false);}}>캐릭터 꾸미기 · 12가지 외형</button><p className={styles.caption}>공간에서 사용하는 실제 캐릭터를 보며 머리·피부·옷·바지·소품을 고를 수 있어요.</p></>}{!toolsPane&&<><label className={styles.field}>닉네임<input maxLength={24} value={draft.nickname} onChange={e=>setDraft({...draft,nickname:e.target.value})}/></label><fieldset><legend>캐릭터 외형</legend><div className={styles.controls}>{(['male','female'] as const).map((g,i)=><button aria-pressed={draft.gender===g} key={g} onClick={()=>setDraft({...draft,gender:g})}>{i?'여성형':'남성형'}</button>)}</div></fieldset><label className={styles.field}>승무원 의상<input type="color" value={draft.coat} onChange={e=>setDraft({...draft,coat:e.target.value})}/></label>{renderer==='classic'&&<><label className={styles.field}>액세서리<select aria-label="액세서리" value={draft.accessory} onChange={e=>setDraft({...draft,accessory:e.target.value as SpaceProfile['accessory']})}><option value="none">기본</option><option value="glasses">안경</option><option value="headset">통신 헤드셋</option></select></label><label className={styles.field}>내 집중 책상 분위기<select aria-label="내 집중 책상 분위기" value={draft.deskTheme} onChange={e=>setDraft({...draft,deskTheme:e.target.value as SpaceProfile['deskTheme']})}><option value="orbital">오비탈 블루</option><option value="night">조용한 밤</option><option value="garden">초록 쉼터</option></select></label></>}<p className={styles.caption}>공개 참여 상태: {statuses[participationStatus(participation)]} · 위의 참여 방식에서 바꿀 수 있어요.</p></>}<label className={styles.field}>나만 보는 책상 메모<input value={draft.desk} maxLength={120} onChange={e=>setDraft({...draft,desk:e.target.value})}/></label><label className={styles.check}><input type="checkbox" checked={draft.photoOptIn} onChange={e=>setDraft({...draft,photoOptIn:e.target.checked})}/>동료가 찍는 공간 사진에 참여하기</label><label className={styles.check}><input type="checkbox" checked={draft.lowMotion} onChange={e=>setDraft({...draft,lowMotion:e.target.checked})}/>가벼운 공간 메뉴를 기본으로 사용</label><p className={styles.caption}>기존 우주선의 책상 테마는 내 화면에만 반영됩니다. 닉네임·캐릭터·상태·사진 참여 여부만 같은 기수에 표시해요. 책상 메모와 개인 메모는 나만 봅니다.</p><button disabled={!active||busy||!draft.nickname.trim()} className={styles.primary} onClick={()=>void act(async()=>{const next={...draft,status:participationStatus(participation)};await command({kind:'profile',profile:next});setSaved(next);setDraft(next);setCompact(next.lowMotion);setNotice('내 자리 설정을 저장했어요.');})}>내 자리 저장</button></div>}

   {(spatial||toolsPane)&&pane==='settings'&&<div className={styles.content}><h3>나에게 편한 공간</h3><p>화면과 소리는 내 기기에만 적용돼요.</p><label hidden={!!toolsPane} className={styles.field}>공간 화면<select value={renderer} onChange={e=>{setRenderer(e.target.value==='classic'?'classic':'office');setWorldReady(false);}}><option value="office">문샷 공부방</option><option value="classic">기존 우주선</option></select></label><button hidden={!!toolsPane} onClick={()=>setCompact(v=>!v)}>{compact?'3D 공간 보기':'가벼운 공간 메뉴'}</button>{(onOpenEnvironment||renderer==='office'&&!toolsPane&&!compact)?<button onClick={openEnvironment}>조명·배경음 열기</button>:<><h3>나만 듣는 소리</h3><div className={styles.controls}>{(['wind','rain','ship'] as const).map((kind,i)=><button key={kind} aria-pressed={sound===kind} onClick={()=>void selectSound(kind)}>{['바람','빗소리','우주선'][i]}</button>)}<button onClick={()=>void selectSound(null)}>끄기</button></div><label className={styles.field}>소리 크기<input type="range" min={0} max={100} value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);audio.current?.volume(v);}}/></label></>}<h3>오늘의 참여 방식</h3><div className={styles.controls}>{([['quiet','조용히 집중'],['together','함께 공부'],['help','도움 필요']] as const).map(([mode,label])=><button key={mode} disabled={!modeLoaded||busy} aria-pressed={participation===mode} onClick={()=>void changeParticipation(mode)}>{label}</button>)}</div></div>}

   {spatial&&pane==='directory'&&<div className={styles.content}><h3>어떤 일을 할까요?</h3><div className={styles.controls}>{[['learning','수업·과제'],['community','결과물·피드백'],['business','내 사업 실행'],['ai','AI에게 질문'],['office','내 AI 사무실'],['support','도움 요청·약속'],['journal','실행 수첩']].map(([section,label])=><button key={section} onClick={()=>{setToolsOpen(false);onNavigate?.(section);}}>{label}</button>)}<button onClick={()=>setPane('focus')}>집중과 휴식</button><button onClick={()=>setPane('lounge')}>동료와 대화</button><button onClick={()=>setPane('profile')}>내 캐릭터</button><button onClick={()=>setPane('settings')}>공간 설정·소리</button></div></div>}
 </>;
 if(!scope)return <section className={styles.empty}>먼저 이용 가능한 기수를 선택해 주세요.</section>;
 const peers=state?.peers||[];
 const entryCard=studyEntry?.host&&createPortal(
  <section className={styles.studyEntry} aria-label="지금 공부 중인 수강생">
   <header><h2>지금 공부 중</h2>{active&&<span>{peers.length}명</span>}</header>
   {active?<ul aria-label="공부방 참여자">{peers.map(peer=><li key={peer.userId}><span className={styles.rosterName}>{peer.nickname}{peer.userId===actor&&' · 나'}</span>{peer.userId!==actor&&focusAction(peer,true)}</li>)}</ul>
    :<p role="status">{state?.controls?.paused?'공부방 참여가 잠시 중지됐어요.':busy||(!state&&!error)?'동료를 확인하고 있어요…':error||'동료 연결을 해제했어요.'}</p>}
   <button type="button" disabled={busy||!sessionId||(!state&&!error)||!!state?.controls?.paused} onClick={()=>active?studyEntry.openLounge():void join()}>{active?'대화에 참여하기':'공부방에 참여하기'}</button>
  </section>,studyEntry.host);
 if(toolsPane)return <><section className={styles.space} aria-label="공부방 도구">
  {demo
   ? <p className={styles.demo}>브라우저 안의 체험입니다. 실제 수강생·서버 기록과 연결되지 않습니다.</p>
   : <p className={styles.caption}>{scope.cohortName} 공부방 · 같은 기수 동료와 함께하는 공간이에요.</p>}
  {['focus','lounge','profile'].includes(toolsPane)&&<div className={styles.controls}>
   <span>{active?(demo?'이 브라우저의 체험 동료와 연결됨':'지금 동료와 함께 있어요. 내 별명이 동료에게 보여요.'):'지금은 혼자 있어요.'}</span>
   <button disabled={busy||!sessionId||(!active&&!!state?.controls?.paused)} onClick={()=>void(active?leave():join())}>{active?'동료 연결 끊기':'동료와 함께하기'}</button>
  </div>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{tools}
 </section>{entryCard}</>;
 return <section className={`${styles.space} ${immersive?styles.immersive:''} ${toolsOpen?styles.toolsOpen:''} ${spatial?styles.spatial:''}`} aria-label="문샷 캠퍼스 공간" data-compact={compact}>
  {spatial&&(compact||renderer==='classic')&&<button className={styles.fallbackGuide} onClick={()=>{setPane('directory');setToolsOpen(true);}}>공간 안내</button>}
  {spatial&&clock.phase!=='idle'&&<button className={styles.focusBadge} aria-label="집중 타이머 열기" onClick={()=>{setPane('focus');setToolsOpen(true);}}>{clock.phase==='break'?'휴식':'집중'} · {clockText(clock,now)} <span>기록 열기 ↗</span></button>}
  <header className={styles.header}><div><span className={styles.eyebrow}>문샷 우주 캠퍼스</span><h2>같은 공간, 각자의 한 걸음.</h2><p>{scope.courseTitle} · {scope.cohortName}</p></div><div className={styles.controls}>{immersive&&!spatial&&<button aria-expanded={toolsOpen} onClick={()=>setToolsOpen(v=>!v)}>{toolsOpen?'도구 닫기':'집중·대화·내 자리'}</button>}<span className={styles.connection}>{active?`${state?.peers.length||1}명 연결됨`:'혼자 둘러보는 중'}{demo?' · 체험 탭':''}</span><button className={styles.primary} disabled={busy||!sessionId||!!state?.controls?.paused} onClick={()=>void(active?leave():join())}>{active?'동료 연결 끊기':'동료와 함께하기'}</button></div></header>
  {demo&&<p className={styles.demo}>체험 공간 · 같은 브라우저에서 다른 탭을 열면 서로 만날 수 있어요. 실제 수강생이나 가상 동료를 접속자로 표시하지 않습니다.</p>}
  {state?.controls&&(state.controls.announcement||state.controls.paused)&&<div className={styles.notice} role="status"><strong>{state.controls.paused?'공간이 잠시 쉬고 있어요':'문샷 공간 공지'}</strong><p>{state.controls.announcement}</p>{state.controls.paused&&<button onClick={()=>void refreshRoom()}>공간 상태 다시 확인</button>}</div>}
  <div className={styles.controls} aria-label="오늘의 참여 방식">{([['quiet','조용히 집중'],['together','함께 공부'],['help','도움 필요']] as const).map(([mode,label])=><button key={mode} disabled={!modeLoaded||busy} aria-pressed={participation===mode} onClick={()=>void changeParticipation(mode)}>{label}</button>)}<small>지원실 참여 설정과 함께 저장돼요.</small></div>
  {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
  {progress&&<div className={styles.progress}><div><small>{demo?'체험 성장 기록':'서버에서 확인한 성장 기록'}</small><strong>레벨 {progress.level} {saved.nickname} · {progress.xp.toLocaleString()} 성장 점수</strong><span>승인 과제 {progress.approvedMissions}/{progress.requiredMissions} · 도움 된 의견 {progress.usefulFeedback} · 반영 기록 {progress.appliedRevisions}</span></div><button disabled={!!progress.claimedAt&&(!worldReady||compact)} onClick={()=>progress.claimedAt?post('launch'):onNavigate?.('community')}>{progress.claimedAt?'내 로켓 발사 기록 재생':progress.eligible?'발사 조건 달성 · 기록하기':'발사 조건 확인'}</button><button disabled={!cohortGoalReached(progress)||busy||!worldReady||compact||state?.controls?.paused||state?.controls?.closedZones?.includes('launch')} onClick={()=>void celebrateCohort()}>공동 목표 달성 기념 연출</button></div>}
  <div className={styles.layout}><div>
   <div className={styles.worldBar}><label>공간 화면 <select aria-label="공간 화면" value={renderer} onChange={e=>{const next=e.target.value==='office'?'office':'classic';if(next!==renderer){setWorldReady(false);setRenderer(next);}}}><option value="classic">기존 우주선</option><option value="office">문샷 공부방 · 윤익님 디자인</option></select></label><span>WASD · 방향키 · 바닥 클릭 이동 · E 상호작용</span><button hidden={!!toolsPane} onClick={()=>setCompact(v=>!v)}>{compact?'3D 공간 보기':'가벼운 공간 메뉴'}</button></div>
   {!compact&&token&&<div className={styles.worldViewport} aria-busy={!worldReady}><iframe key={token+renderer} ref={frame} onLoad={()=>{worldState.current.clear();setWorldReady(false);setSlowWorld(false);post('init');}} title="문샷 우주선 3D 공간" className={styles.world} src={`/campus/world/${renderer==='office'?'office/':''}index.html#bridge=${encodeURIComponent(token)}${spatial?'&spatial=1':''}`} sandbox="allow-scripts allow-same-origin" loading="eager" />{!worldReady&&<div className={styles.worldLoading}><span className={styles.loadingMark} aria-hidden="true">✦</span><strong role="status">{slowWorld?'공간을 여는 데 시간이 걸리고 있어요':'나의 문샷 공간을 열고 있어요'}</strong><p>{slowWorld?'가벼운 화면에서도 집중·대화·수업을 이용할 수 있어요.':'캐릭터와 공간을 준비하고 있어요. 잠시만 기다려 주세요.'}</p><button onClick={()=>setCompact(true)}>가벼운 화면으로 시작</button></div>}</div>}
   {renderer==='office'&&<p className={styles.caption}>통합 화면 검수 중 · 집중·과제·의견은 에듀 기능으로 연결됩니다. 기념 사진·로켓 연출은 기존 우주선에서 이용해 주세요.</p>}
   <nav className={styles.zones} aria-label="문샷 공간 선택">{zones.map(([id,title,desc])=><button key={id} disabled={state?.controls?.closedZones?.includes(id)} onClick={()=>{if(compact){if(id==='desk')actions.current.seat();else if(id==='terrace')setPane('focus');else actions.current.navigate(id);}else post('zone',{id});}}><strong>{title}</strong><span>{desc}</span></button>)}</nav>
   <div className={styles.controls}><button onClick={()=>post('camera',{mode:'map'})}>전체 지도</button>{renderer==='classic'&&<button onClick={()=>post('camera',{mode:'first'})}>1인칭</button>}<button onClick={()=>post('camera',{mode:'third'})}>3인칭</button><button disabled={!active} onClick={()=>post('wave')}>손 흔들기</button><button disabled={state?.controls?.closedZones?.includes('board')} onClick={openDemoDay}>{demoSession?'진행 중인 문샷 결과물 발표회':'문샷 결과물 발표회 열기'}</button><button disabled={!worldReady||compact||renderer==='office'} onClick={()=>post('photo',{allowedIds:state?.peers.filter(p=>p.photoOptIn).map(p=>p.userId)||[]})}>기념 사진 저장</button></div>
   {renderer==='office'&&!compact?<button onClick={openEnvironment}>조명·배경음 열기</button>:<details className={styles.ambient}><summary>나만 듣는 공간 소리</summary><div className={styles.controls}>{(['wind','rain','ship'] as const).map((kind,i)=><button aria-pressed={sound===kind} key={kind} onClick={()=>void selectSound(kind)}>{['바람','빗소리','우주선'][i]}</button>)}<button onClick={()=>void selectSound(null)}>소리 끄기</button></div><label className={styles.field}>소리 크기<input type="range" min={0} max={100} value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);audio.current?.volume(v);}}/></label><small>직접 합성한 환경음입니다. 마이크는 사용하지 않아요.</small></details>}
   {exhibition.length>0&&<nav className={styles.exhibition} aria-label="문샷 작품 전시"><h3>{demo?'체험 · ':''}동료가 공유한 작품</h3><p>같은 기수에서 지금 공개된 작품 일부예요. 순위가 아닙니다.</p>{exhibition.map(p=><button key={p.id} disabled={state?.controls?.closedZones?.includes('board')} onClick={()=>openExhibit(p.id)}><strong>{p.title}</strong><span>{p.alias}</span></button>)}</nav>}
   {demoSession&&<p className={styles.notice}>지금 발표 중 · {demoSession.title}</p>}<small className={styles.caption}>사진에는 나와 촬영에 참여한 동료만 포함됩니다. 사진은 이 기기에만 저장됩니다.</small>
   {photo&&<a className={styles.download} href={photo} download="moonshot-campus.png">기념 사진 PNG 내려받기</a>}
   <details className={styles.lesson}><summary>내 수업 · {snapshot.lessons.filter(l=>l.completed).length}/{snapshot.lessons.length}개 확인</summary><div>{snapshot.lessons.map(l=><button key={l.id} onClick={()=>onOpenLesson?.(l.id)}>{l.completed?'✓ ':''}{l.day}일차 · {l.title}</button>)}</div></details>
  </div>{spatial?<CampusWindow open={toolsOpen} small title={pane==='focus'?'집중과 휴식':pane==='lounge'?'동료와 대화':pane==='settings'?'공간 설정':pane==='directory'?'공간 안내':'내 자리'} onClose={()=>setToolsOpen(false)}><div className={styles.side}>{tools}</div></CampusWindow>:<aside className={styles.side}>{tools}</aside>}</div><details className={styles.ambient}><summary>현재 연결 상태</summary><p>{demo?'같은 브라우저 체험 연결':'현재 브라우저에서 측정한 연결'} · {state?.metrics?({connecting:'연결 중',connected:'연결됨',reconnecting:'다시 연결 중',closed:'연결 종료'}[state.metrics.status]):'입장 전'}</p>{state?.metrics&&<p>이동·근처 전송 시도 {state.metrics.sent}회 · 받은 소식 {state.metrics.received}회 · 서버 연결 {state.metrics.apiCalls}회 · 오류 {state.metrics.errors}회 · 재연결 {state.metrics.reconnects}회 · 최근 응답 {state.metrics.lastRttMs===null?'측정 전':state.metrics.lastRttMs+'ms'}</p>}<p className={styles.caption}>내 기기의 연결 상태입니다. 다른 수강생의 연결 상태와는 다를 수 있어요.</p>{!active&&<button disabled={busy||!sessionId||!!state?.controls?.paused} onClick={()=>void join()}>다시 연결하기</button>}</details>
 </section>;
}
