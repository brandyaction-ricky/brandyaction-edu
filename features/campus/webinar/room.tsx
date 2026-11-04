'use client';
import Link from 'next/link';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,BookOpen,Bot,Check} from 'lucide-react';
import type {CampusSnapshot} from '../contracts';
import {ResourceLibrary} from './resource-library';
import type {TourRoom} from '../tour/model';
import {loginPath,type AccessResult,type PublicWebinar,type WebinarEvent} from './domain';
import styles from './visitor.module.css';
const Tour=lazy(()=>import('../tour/preview').then(m=>({default:m.FourSpacesPreview})));
// Public visitors never receive an enrollment, curriculum or account profile.
const visitorSnapshot:CampusSnapshot={schemaVersion:1,fetchedAt:'',viewer:{id:'public-visitor',displayName:'문샷 방문자'},scopes:[],selectedEnrollmentId:null,lessons:[],links:{classes:'/my/classes',questions:'/my/questions'},launchEligibility:null};
const stories={
 study:{title:'문샷 공부방',eyebrow:'혼자 보던 수업을, 함께 해내는 시간으로',description:'오늘 배운 것을 내 일에 적용하고, 동료와 결과를 나누는 수강생 공간이에요.',steps:[['오늘의 수업','내 일차의 수업과 과제를 바로 확인해요.'],['작게 실행하기','집중 시간을 정하고 나만의 결과물을 만들어요.'],['동료의 시선 더하기','결과물을 공유하고 받은 의견으로 개선해요.']],note:'수업과 과제는 본인의 기수·수강 기간에 맞춰 열립니다.'},
 office:{title:'내 AI 사무실',eyebrow:'배운 AI를 내 업무에 적용하는 나만의 자리',description:'해야 할 일부터 만든 결과와 다음 실행까지, 흩어지지 않게 한곳에 모아보세요.',steps:[['할 일 정리','누구를 위한 일인지, 어떤 결과가 필요한지 정해요.'],['결과 검토','업무 요청과 결과를 모아 직접 확인해요.'],['다음 실행','작업 순서와 성과를 기록하고 다시 활용해요.']],note:'개인 업무는 다른 방문자에게 보이지 않아요. 실제 텔레그램 봇 초대·자동 실행은 별도 연결이 필요하며 현재 준비 중입니다.'},
 welcome:{title:'문샷 웰컴 존',eyebrow:'구매한 순간부터, 첫 수업을 준비하는 곳',description:'개강 전에도 작은 준비를 시작할 수 있어요. 처음이라 낯선 AI를 한 걸음씩 만나보세요.',steps:[['첫 안내','온보딩 영상으로 학습 흐름을 알아봐요.'],['OX 퀴즈','AI를 안전하게 쓰는 기본을 익혀요.'],['내 시작점','간단한 질문으로 어느 부분부터 연습할지 살펴봐요.']],note:'구매자에게 열리는 준비 공간입니다. 개강일과 정규 수업 이용 기간은 과정 안내에서 확인하세요.'},
} as const;
export function WebinarRoom({event,demo=false,devReview=false,qaCrowd=false}:{event:PublicWebinar;demo?:boolean;devReview?:boolean;qaCrowd?:boolean}){
 const sent=useRef(new Set<string>());
 function record(name:WebinarEvent){if(demo||devReview||sent.current.has(name))return;sent.current.add(name);try{let session=sessionStorage.getItem('edu-visit');if(!session){session=crypto.randomUUID();sessionStorage.setItem('edu-visit',session);}void fetch(`/api/campus/webinar/${event.slug}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,event:name}),keepalive:true}).catch(()=>{});}catch{/* Entry works even without browser storage. */}}
 return <Suspense fallback={<main className={styles.loading} role="status">문샷 공간과 캐릭터를 준비하고 있어요…</main>}><Tour snapshot={visitorSnapshot} visitor={{presenceId:event.slug,devPresence:devReview,qaCrowd:devReview&&qaCrowd,title:event.title,onEnter:()=>record('entry'),onActivity:id=>{if(id==='experience')record('experience');},renderGate:room=><SpaceInvitation key={room} room={room} event={event} demo={demo} record={record}/>,renderTool:tool=>tool.startsWith('library:')?<ResourceLibrary items={event.resources} initial={tool==='library:replay'?'youtube':'file'}/>:tool==='experience'?<Experience/>:tool.startsWith('story:')?<Story topic={tool.slice(6)} event={event} demo={demo} record={record}/>:<SpaceInvitation room="study" event={event} demo={demo} record={record} general/>}}/></Suspense>;
}
function SpaceInvitation({room,event,demo,record,general=false}:{room:TourRoom;event:PublicWebinar;demo:boolean;record:(name:WebinarEvent)=>void;general?:boolean}){
 const story=stories[room==='office'?'office':room==='welcome'?'welcome':'study'];
 const [access,setAccess]=useState<AccessResult|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
 const busy=useRef(false),abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>abort.current?.abort(),[]);
 useEffect(()=>{if(!general)record('gate');},[general,record]);
 async function check(){if(busy.current)return;busy.current=true;setChecking(true);setError('');try{if(demo){setAccess({kind:'login',href:loginPath(event.slug)});return;}const controller=new AbortController();abort.current=controller;const section=room==='office'?'office':'space';const r=await fetch(`/api/campus/webinar/${event.slug}/access?section=${section}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});const value=await r.json();if(!r.ok)throw Error(value.error||'수강 권한을 확인하지 못했어요.');setAccess(value);}catch(e){if(!abort.current?.signal.aborted)setError((e as Error).message);}finally{busy.current=false;setChecking(false);}}
 const link=(kind:'detail'|'consult'|'checkout',label:string,href:string)=><a className={kind==='detail'?styles.primary:styles.secondary} href={demo?'#preview':href} target={demo?undefined:'_blank'} rel="noopener noreferrer" onClick={e=>{if(demo)e.preventDefault();record(kind);}}>{label}<ArrowUpRight size={18}/></a>;
 return <article className={styles.invitation}>
  <div className={styles.hero} data-room={room}>{room==='office'?<Bot size={34}/>:<BookOpen size={34}/>}<small>{general?'MOONSHOT CHALLENGE':story.eyebrow}</small><h2>{general?'다음 도약, 문샷에서 함께해요.':story.title}</h2><p>{general?'수업에서 배운 것을 내 일에 적용하고, 동료와 실행을 이어가는 과정입니다.':story.description}</p></div>
  <ol className={styles.steps}>{story.steps.map(([title,description],i)=><li key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{description}</p></div><Check size={17}/></li>)}</ol>
  <p className={styles.note}>{story.note}</p>
  <div className={styles.actions}>{link('detail','문샷 과정 자세히 보기',event.detailPath)}{event.kakaoUrl?link('consult','카카오 채널로 문의하기',event.kakaoUrl):<p className={styles.note}>상담 채널을 준비하고 있어요. 과정 안내에서 문의 방법을 확인해 주세요.</p>}</div>
  <p className={styles.returnNote}>안내는 새 창에서 열려요. 돌아오면 이 공간에서 계속 둘러볼 수 있어요.</p>
  <p className={styles.enroll}><a href={demo?'#preview':event.checkoutPath} target={demo?undefined:'_blank'} rel="noopener noreferrer" onClick={e=>{if(demo)e.preventDefault();record('checkout');}}>과정을 확인했다면 수강 신청하기 ↗</a></p>
  <details className={styles.member}><summary>이미 구매한 수강생인가요?</summary><p>내 계정의 수강권을 확인한 뒤 전용 공간으로 연결해요.</p>{!access&&<button disabled={checking} onClick={()=>void check()}>{checking?'수강권 확인 중…':'내 수강권으로 입장하기'}</button>}{error&&<p role="alert">{error} 다시 시도해 주세요.</p>}{access?.kind==='member'||access?.kind==='welcome'?<a href={demo?'#preview':access.href} onClick={e=>{if(demo)e.preventDefault();}}>{access.kind==='member'?'내 문샷 공간으로 이동':'개강 준비 공간으로 이동'}</a>:access?.kind==='login'?<a href={demo?'#preview':access.href} onClick={e=>{if(demo)e.preventDefault();}}>에듀 계정으로 로그인</a>:access?.kind==='offer'?<p>이 행사와 연결된 기수의 수강권이 없어요. 다른 기수 수강생은 <Link href="/my/classes">내 클래스</Link>에서 입장해 주세요.</p>:null}</details>
  {demo&&<p className={styles.note}>동작 미리보기 · 외부 이동·결제·회원 정보 조회 없음</p>}
 </article>;
}
function Experience(){const [answer,setAnswer]=useState<number|null>(null);return <section className={styles.invitation}><small>3분 체험 · 실제 AI 호출이나 과제 점수와 무관해요</small><h2>AI에게 일을 부탁해 볼까요?</h2><p>“우리 상품 홍보 글을 써줘”라는 요청을 어떻게 개선하면 좋을까요?</p><div className={styles.answers}>{['글의 길이만 길게 늘려 달라고 한다.','고객·해결할 문제·원하는 행동을 함께 알려준다.','같은 질문을 계속 반복한다.'].map((a,i)=><button key={a} aria-pressed={answer===i} onClick={()=>setAnswer(i)}>{a}</button>)}</div>{answer!==null&&<p role="status"><strong>{answer===1?'첫 미션 완료!':'한 번 더 생각해 볼까요?'}</strong><br/>{answer===1?'목적과 맥락을 알려주면 결과를 실제 업무에 적용하기 쉬워져요. 문샷에서는 내 사업의 결과물을 만들고 동료 의견으로 개선해요.':'AI가 누구를 위해 무엇을 해야 하는지 알 수 있도록 맥락을 더해 보세요.'}</p>}</section>;}

const examples={
 study:{title:'만든 결과를 함께 개선하는 시간',room:'study' as const,lines:[['질문 예시','광고 문구를 만들었는데 고객에게 와닿는지 모르겠어요.'],['동료 의견 예시','누구의 어떤 문제를 해결하는지 첫 문장부터 보여주면 어떨까요?']],next:'수업에서 만들고, 동료의 시선으로 개선하기'},
 office:{title:'배운 AI를 내 일에 연결하기',room:'office' as const,lines:[['질문 예시','AI로 만든 초안이 여러 곳에 흩어져 있어요.'],['활용 예시','할 일과 결과를 사무실에 모아 검토하고 다음 실행으로 연결해 보세요.']],next:'내 AI 사무실에서 할 수 있는 일'},
 welcome:{title:'처음이라도, 시작은 작게',room:'welcome' as const,lines:[['질문 예시','AI를 처음 사용하는데 따라갈 수 있을까요?'],['안내 예시','개강 전 안내와 짧은 퀴즈로 준비하고, 수업에서는 내 일에 하나씩 적용해 봐요.']],next:'문샷의 학습 흐름 알아보기'},
};
function Story({topic,event,demo,record}:{topic:string;event:PublicWebinar;demo:boolean;record:(name:WebinarEvent)=>void;onExplore?:()=>void}){
 const story=examples[topic as keyof typeof examples]||examples.study;
 return <section className={styles.invitation}><small>수업 속 대화 예시 · 실제 참여자 발언이나 수강 후기가 아닙니다.</small><h2>{story.title}</h2><div className={styles.exampleConversation}>{story.lines.map(([label,line])=><div key={label}><small>{label}</small><p>{line}</p></div>)}</div><p>이런 과정을 내 일에 적용해 보고 싶다면, 수업 구성과 필요한 준비를 먼저 확인해 보세요.</p><SpaceInvitation room={story.room} event={event} demo={demo} record={record}/></section>;
}
