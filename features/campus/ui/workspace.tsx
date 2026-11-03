'use client';
import dynamic from 'next/dynamic';
import {useEffect,useRef,useState} from 'react';
import {Orbit,ChartNoAxesCombined,Users,BriefcaseBusiness,LifeBuoy,Bot,NotebookPen} from 'lucide-react';
import type {CampusSnapshot} from '../contracts';
import {CampusFrame,LearnerDashboard} from './dashboard';
import {createEduBridge,type EduBridge,type BridgeState} from '@/public/campus/edu-bridge.mjs';
const BusinessPanel=dynamic(()=>import('../business/panel').then(m=>m.BusinessPanel),{loading:()=> <p role="status">화면을 열고 있어요.</p>});
const CommunityPanel=dynamic(()=>import('../community/panel').then(m=>m.CommunityPanel),{loading:()=> <p role="status">화면을 열고 있어요.</p>});
const SpacePanel=dynamic(()=>import('../space/panel').then(m=>m.SpacePanel),{loading:()=> <p role="status">화면을 열고 있어요.</p>});
import {MiniFocus} from '../space/mini-focus';
const OfficePanel=dynamic(()=>import('../office/panel').then(m=>m.OfficePanel),{loading:()=> <p role="status">화면을 열고 있어요.</p>});
import {WorkspaceSignals} from '../support/signals';
const SupportPanel=dynamic(()=>import('../support/panel').then(m=>m.SupportPanel),{loading:()=> <p role="status">화면을 열고 있어요.</p>});
import type {FocusSession} from '../focus-domain';
import styles from './workspace.module.css';
import {campusDraftState} from './draft-guard';
import {DemoAi} from './demo-ai';

const LiveAiPanel=dynamic(()=>import('./live-ai-panel').then(m=>m.LiveAiPanel),{loading:()=> <p role="status">AI 질문 화면을 열고 있어요.</p>});
const sections=[['learning','성장·미션',ChartNoAxesCombined],['space','문샷 공간',Orbit],['community','결과물·의견',Users],['business','내 사업 실행',BriefcaseBusiness],['support','도움·약속',LifeBuoy],['ai','AI 조교·멘토',Bot],['office','내 AI 사무실',BriefcaseBusiness],['journal','실행 수첩',NotebookPen]] as const;
export function CampusWorkspace({snapshot,demo=false,initialSection='learning',onOpen,onSelect,onRefresh,community}:{snapshot:CampusSnapshot;demo?:boolean;initialSection?:string;onOpen:(id:string,mission?:string)=>void;onSelect:(id:string)=>void;onRefresh:()=>void;community?:React.ReactNode}){
 const [section,setSection]=useState(initialSection),[notice,setNotice]=useState('');
 const [handoff,setHandoff]=useState<{lessonId:string;context:string}|null>(null);
 const [visited,setVisited]=useState(()=>new Set([initialSection]));
 function ask(value:{lessonId:string;context:string}){const g=campusDraftState('campus-ai');if(g.locked){setNotice('현재 AI 답변이 끝난 후 새 질문을 넘겨 주세요.');return;}if(g.dirty&&!window.confirm('AI 화면에 작성 중인 질문이 있습니다. 새 질문으로 바꿀까요?'))return;setHandoff(value);navigate('ai');}
 function open(id:string,mission?:string){const g=campusDraftState();if(g.locked){setNotice('저장이 끝난 후 수업을 열어 주세요.');return;}if(g.dirty&&!window.confirm('저장하지 않은 내용이 있습니다. 내용을 버리고 수업으로 이동할까요?'))return;onOpen(id,mission);}
 function refresh(){const g=campusDraftState();if(g.locked){setNotice('저장이 끝난 후 새로고침해 주세요.');return;}if(g.dirty&&!window.confirm('저장하지 않은 내용이 있습니다. 내용을 버리고 새로고침할까요?'))return;onRefresh();}
 function changeScope(id:string){const guard=campusDraftState();if(guard.locked){setNotice('저장이나 답변을 기다리고 있어요. 완료 후 기수를 변경해 주세요.');return;}if(guard.dirty&&!window.confirm('저장하지 않은 작성 내용이 있어요. 내용을 버리고 기수를 변경할까요?'))return;onSelect(id);}
 function navigate(value:string){if(!sections.some(s=>s[0]===value))return;if(section==='space'&&value!=='space'){const g=campusDraftState('campus-space');if(g.locked){setNotice('저장을 마친 후 이동해 주세요.');return;}if(g.dirty&&!window.confirm('저장하지 않은 공간 설정이 있어요. 내용을 버리고 이동할까요?'))return;}setSection(value);setVisited(old=>new Set([...old,value]));setNotice('');}
 return <CampusFrame demo={demo}><div className={styles.shell}><div className={styles.scope}><strong>문샷 학습 공간</strong><select aria-label="학습 공간 기수" value={snapshot.selectedEnrollmentId||''} onChange={e=>changeScope(e.target.value)}>{snapshot.scopes.map(s=><option key={s.enrollmentId} value={s.enrollmentId}>{s.courseTitle} · {s.cohortName}</option>)}</select></div><nav className={styles.nav} aria-label="문샷 기능">{sections.map(([key,label,Icon])=><button key={key} aria-current={section===key?'page':undefined} onClick={()=>navigate(key)}><Icon size={17}/>{label}</button>)}</nav><WorkspaceSignals snapshot={snapshot} demo={demo} onNavigate={navigate}/>{notice&&<p role="status" className={styles.alert}>{notice}</p>}<div className={styles.content}>
 <div hidden={section!=='learning'}>{visited.has('learning')&&<LearnerDashboard snapshot={snapshot} demo={demo} onOpen={open} onSelect={changeScope} onRefresh={refresh}/>}</div>
 {section==='space'&&<SpacePanel snapshot={snapshot} demo={demo} onOpenLesson={open} onNavigate={navigate}/>}
 <div hidden={section!=='community'}>{visited.has('community')&&(community||<CommunityPanel key={snapshot.viewer.id+snapshot.selectedEnrollmentId} snapshot={snapshot} demo={demo} onOpen={open}/>)}</div>
 <div hidden={section!=='business'}>{visited.has('business')&&<BusinessPanel key={snapshot.viewer.id+snapshot.selectedEnrollmentId} snapshot={snapshot} demo={demo} onOpenLesson={open} onAsk={ask}/>}</div>
 <div hidden={section!=='support'}>{visited.has('support')&&<SupportPanel key={snapshot.viewer.id+snapshot.selectedEnrollmentId} snapshot={snapshot} demo={demo} onOpen={open} onAsk={ask}/>}</div>
 <div hidden={section!=='ai'}>{visited.has('ai')&&<AiPanel key={snapshot.viewer.id+snapshot.selectedEnrollmentId+(handoff?.context||'')} snapshot={snapshot} demo={demo} handoff={handoff}/>}</div>
 <div hidden={section!=='office'}>{visited.has('office')&&<OfficePanel key={snapshot.viewer.id+snapshot.selectedEnrollmentId} snapshot={snapshot} demo={demo}/>}</div>
 <div hidden={section!=='journal'}>{visited.has('journal')&&<JournalPanel key={snapshot.viewer.id+snapshot.selectedEnrollmentId} snapshot={snapshot} demo={demo} active={section==='journal'}/>}</div>
 </div>{section!=='space'&&<MiniFocus snapshot={snapshot} demo={demo} onReturn={()=>navigate('space')}/>}</div></CampusFrame>;
}
export function AiPanel({snapshot,demo,handoff}:{snapshot:CampusSnapshot;demo:boolean;handoff?:{lessonId:string;context:string}|null}){return demo?<DemoAi snapshot={snapshot} handoff={handoff}/>:<LiveAiPanel snapshot={snapshot} demo={false} handoff={handoff}/>;}

function JournalPanel({snapshot,demo,active}:{snapshot:CampusSnapshot;demo:boolean;active:boolean}){
 const [items,setItems]=useState<FocusSession[]>([]),[error,setError]=useState(''),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false);
 const controller=useRef<AbortController|null>(null),alive=useRef(true),busy=useRef(false),generation=useRef(0);
 async function load(after?:string){if(busy.current)return;busy.current=true;const ticket=++generation.current;setLoading(true);setError('');controller.current?.abort();controller.current=new AbortController();try{if(demo){const raw=localStorage.getItem('moonshot-focus-journal-demo-v1:'+snapshot.viewer.id+':'+snapshot.selectedEnrollmentId);setItems(raw?JSON.parse(raw):[]);setCursor(null);return;}const r=await fetch('/api/campus/journal?enrollmentId='+snapshot.selectedEnrollmentId+(after?'&cursor='+encodeURIComponent(after):''),{cache:'no-store',signal:controller.current.signal});const data=await r.json();if(!r.ok)throw Error(data.error);if(alive.current&&ticket===generation.current){setItems(old=>after?[...old,...data.items]:data.items);setCursor(data.nextCursor);}}catch(e){if(alive.current&&ticket===generation.current&&(e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(ticket===generation.current){busy.current=false;if(alive.current)setLoading(false);}}}
 useEffect(()=>{alive.current=true;void Promise.resolve().then(()=>{if(alive.current&&active)void load();});return()=>{alive.current=false;generation.current++;busy.current=false;controller.current?.abort();};},[active]); // eslint-disable-line react-hooks/exhaustive-deps
 return <section className={styles.journal}><h2>나의 실행 수첩</h2><button disabled={loading} onClick={()=>void load()}>실행 기록 새로고침</button><p>15분 실행에서 남긴 결과와 다음 행동을 시간순으로 다시 봅니다. 이 기록은 집중도나 실제 성과의 증명이 아닙니다.</p>{error&&<p role="alert">{error}</p>}{!items.length&&!loading&&<article><h3>작은 실행부터 기록해 보세요</h3><p>{demo?'가상 미리보기에서는 실제 서버 수첩을 조회하지 않습니다. 성장·미션에서 15분 실행 저장 흐름을 체험할 수 있어요.':'성장·미션에서 15분 실행을 마무리하면 기록이 쌓여요.'}</p></article>}{items.map(i=><article key={i.id}><small>{new Date(i.created_at).toLocaleString('ko-KR')} · {i.status==='finished'?'마무리':'진행 기록'}</small><h3>{i.action_text}</h3><p>{i.result_note}</p><strong>다음 한 걸음</strong><p>{i.next_step||'아직 정하지 않았어요'}</p></article>)}{loading&&<p role="status">기록을 불러오고 있어요.</p>}{cursor&&<button onClick={()=>void load(cursor)} disabled={loading}>이전 실행 더 보기</button>}</section>;
}
export function WorkspaceLive({communityRender}:{communityRender?:(s:CampusSnapshot)=>React.ReactNode}){
 const [state,setState]=useState<BridgeState>({status:'loading',snapshot:null}),[error,setError]=useState('');const bridge=useRef<EduBridge|null>(null),selected=useRef<string|null>(null);
 useEffect(()=>{const b=createEduBridge({onState:setState});bridge.current=b;b.load().then(data=>{const requested=new URLSearchParams(window.location.search).get('enrollmentId');const first=data.scopes.find(s=>s.enrollmentId===requested)?.enrollmentId||data.scopes[0]?.enrollmentId;if(first){selected.current=first;return b.load(first);}}).catch(()=>{});return()=>{b.dispose();bridge.current=null;};},[]);
 function run(p:Promise<unknown>|undefined){setError('');p?.catch(e=>{if(e.name!=='AbortError')setError(e.message);});}
 if(state.status!=='ready')return <CampusFrame><h1>문샷 학습 공간</h1><p role={state.status==='error'?'alert':'status'}>{state.status==='error'?state.message:'나의 수강 기록을 확인하고 있어요.'}</p>{state.status==='error'&&<button onClick={()=>run(bridge.current?.load(selected.current))}>다시 확인</button>}</CampusFrame>;
 const snapshot=state.snapshot as CampusSnapshot;return <>{error&&<p role="alert">{error}</p>}<CampusWorkspace key={snapshot.viewer.id+snapshot.selectedEnrollmentId} initialSection={typeof window!=='undefined'?new URLSearchParams(window.location.search).get('section')||'learning':'learning'} snapshot={snapshot} onSelect={id=>{selected.current=id;run(bridge.current?.load(id));}} onRefresh={()=>run(bridge.current?.load(selected.current))} onOpen={(lesson,mission)=>{if(selected.current)run(mission?bridge.current?.openMission(selected.current,lesson,mission):bridge.current?.openLesson(selected.current,lesson));}} community={communityRender?.(snapshot)}/></>;
}
