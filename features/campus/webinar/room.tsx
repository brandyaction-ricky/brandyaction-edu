'use client';
import {campusActivity} from '../analytics/client';
import {CustomerQuiz} from './customer-quiz';
import {lazy,Suspense,useEffect,useRef} from 'react';
import {ArrowUpRight,BookOpen,Bot,Check} from 'lucide-react';
import type {CampusSnapshot} from '../contracts';
import {ResourceLibrary} from './resource-library';
import type {TourRoom} from '../tour/model';
import {type PublicWebinar,type WebinarEvent} from './domain';
import styles from './visitor.module.css';
const Tour=lazy(()=>import('../tour/preview').then(m=>({default:m.FourSpacesPreview})));
// Public visitors never receive an enrollment, curriculum or account profile.
const visitorSnapshot:CampusSnapshot={schemaVersion:1,fetchedAt:'',viewer:{id:'public-visitor',displayName:'문샷 방문자'},scopes:[],selectedEnrollmentId:null,lessons:[],links:{classes:'/my/classes',questions:'/my/questions'},launchEligibility:null};
const stories={
 study:{title:'문샷 공부방',eyebrow:'혼자 보던 수업을, 함께 해내는 시간으로',description:'오늘 배운 것을 내 일에 적용하고, 동료와 결과를 나누는 수강생 공간이에요.',steps:[['오늘의 수업','내 일차의 수업과 과제를 바로 확인해요.'],['작게 실행하기','집중 시간을 정하고 나만의 결과물을 만들어요.'],['동료의 시선 더하기','결과물을 공유하고 받은 의견으로 개선해요.']],note:'수업과 과제는 본인의 기수·수강 기간에 맞춰 열립니다.'},
 office:{title:'내 AI 사무실',eyebrow:'혼자 하던 일을, 내 AI 자동화 팀과 함께',description:'마케팅, 경쟁사 조사, 고객 응대 하시느라 정작 중요한 일은 뒤로 밀려버리죠! 이제 반복하는 일을 맡길 AI 직원을 직접 만들어 보세요. 문샷에서 배운 AI 봇을 한 사무실에 모아, 내 사업에 맞는 팀을 직접 구성합니다!',steps:[['내 일에 맞는 AI 직원 만들기','매일 반복하는 일부터 골라, 맡길 업무와 답변 기준을 정해요.'],['업무별로 팀 구성하기','고객 조사·콘텐츠 기획·문의 응대. 내가 만든 봇을 불러와 담당 업무를 나눠요.'],['나는 방향을 정하고, 결과를 다듬기','사무실에서 담당 봇을 찾아 텔레그램으로 요청하고, 돌아온 결과를 검토해 다음 실행으로 이어가요.']],note:'AI를 한 번 써보는 데서 끝내지 않고, 내 일을 함께할 팀을 만드는 과정. 문샷에서 시작하세요.'},
 welcome:{title:'문샷 웰컴 존',eyebrow:'구매한 순간부터, 첫 수업을 준비하는 곳',description:'개강 전에도 작은 준비를 시작할 수 있어요. 처음이라 낯선 AI를 한 걸음씩 만나보세요.',steps:[['첫 안내','온보딩 영상으로 학습 흐름을 알아봐요.'],['OX 퀴즈','AI를 안전하게 쓰는 기본을 익혀요.'],['내 시작점','간단한 질문으로 어느 부분부터 연습할지 살펴봐요.']],note:'구매자에게 열리는 준비 공간입니다. 개강일과 정규 수업 이용 기간은 과정 안내에서 확인하세요.'},
} as const;
export function WebinarRoom({event,demo=false,devReview=false,qaCrowd=false,collectActivity=true}:{event:PublicWebinar;demo?:boolean;devReview?:boolean;qaCrowd?:boolean;collectActivity?:boolean}){
 const sent=useRef(new Set<string>());
 function record(name:WebinarEvent){if(['detail','consult','checkout'].includes(name))campusActivity(name as 'detail'|'consult'|'checkout');if(demo||devReview||sent.current.has(name))return;sent.current.add(name);try{let session=sessionStorage.getItem('edu-visit');if(!session){session=crypto.randomUUID();sessionStorage.setItem('edu-visit',session);}void fetch(`/api/campus/webinar/${event.slug}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,event:name}),keepalive:true}).catch(()=>{});}catch{/* Entry works even without browser storage. */}}
 return <Suspense fallback={<main className={styles.loading} role="status">문샷 공간과 캐릭터를 준비하고 있어요…</main>}><Tour snapshot={visitorSnapshot} visitor={{analyticsScope:!demo&&collectActivity?event.slug:undefined,presenceId:event.slug,devPresence:devReview,qaCrowd:devReview&&qaCrowd,title:event.title,onEnter:()=>record('entry'),onActivity:id=>{if(id==='experience')record('experience');},renderGate:room=><SpaceInvitation key={room} room={room} event={event} demo={demo} record={record}/>,renderTool:(tool,onPlay)=>tool.startsWith('library:')?<ResourceLibrary onPlay={onPlay} items={event.resources} initial={tool==='library:all'?'all':tool==='library:replay'?'youtube':'file'}/>:tool==='experience'?<CustomerQuiz/>:tool.startsWith('story:')?<Story topic={tool.slice(6)} event={event} demo={demo} record={record}/>:<CourseDetail event={event} demo={demo} record={record}/>}}/></Suspense>;
}
function SpaceInvitation({room,event,demo,record,general=false}:{room:TourRoom;event:PublicWebinar;demo:boolean;record:(name:WebinarEvent)=>void;general?:boolean}){
 const story=stories[room==='office'?'office':room==='welcome'?'welcome':'study'];
 useEffect(()=>{if(!general)record('gate');},[general,record]);
 const link=(kind:'detail'|'consult',label:string,href:string)=><a className={kind==='detail'?styles.primary:styles.secondary} href={demo?'#preview':href} target={demo?undefined:'_blank'} rel="noopener noreferrer" onClick={e=>{if(demo)e.preventDefault();record(kind);}}>{label}<ArrowUpRight size={18}/></a>;
 return <article className={styles.invitation}>
  <div className={styles.hero} data-room={room}>{room==='office'?<Bot size={34}/>:<BookOpen size={34}/>}<small>{general?'MOONSHOT CHALLENGE':story.eyebrow}</small><h2>{general?'AI를 써보는 사람에서, 내 일에 쓰는 사람으로.':story.title}</h2><p>{general?'고객을 발견하고, 콘텐츠를 만들고, 반응을 확인하세요. 문샷은 배운 AI를 내 사업의 실행으로 연결하는 과정입니다.':story.description}</p></div>
  {room==='office'&&<figure className={styles.proof}><a href="/campus/showcase/ai-office-real-enhanced-v3.webp" target="_blank" rel="noopener noreferrer" aria-label="실제 사무실 이미지 크게 보기"><img src="/campus/showcase/ai-office-real-enhanced-v3.webp" width="1473" height="1068" alt="실제 AI 사무실 화면: 어사이드 원격제어봇, GEO 담당자, 노출팀장, 콘텐츠 기획 담당자, 고객상담 담당자, 에듀와 문샷 Q&A 승인봇, Aside"/></a><figcaption>실제 사무실 화면 · 봇 이름과 화질을 보정한 이미지. 이미지를 누르면 크게 볼 수 있어요.</figcaption><div className={styles.botRoles}><span>고객 조사</span><span>콘텐츠 기획</span><span>문의 응대</span><span>업무 정리</span></div></figure>}
  {room==='study'&&<figure className={styles.proof}><video src="/campus/showcase/learning-knowledge-full-v2.mp4" width="848" height="608" autoPlay muted loop playsInline controls preload="metadata" aria-label="점들이 연결되어 지식이 되는 과정 · 전체 영상"/><figcaption>문샷 공개 과정 소개의 실제 지식 연결 예시. 내 사업을 AI에게 알려 주고, 콘텐츠·랜딩페이지·고객상담 업무에 활용하는 흐름을 배워요.</figcaption><a href="/campus/showcase/learning-knowledge-full-v2.mp4" target="_blank" rel="noopener noreferrer">학습 예시 크게 보기 ↗</a></figure>}
  <ol className={styles.steps}>{story.steps.map(([title,description],i)=><li key={title}><span>0{i+1}</span><div><h3>{title}</h3><p>{description}</p></div><Check size={17}/></li>)}</ol>
  <p className={styles.note}>{story.note}</p>
  <div className={styles.actions}>{link('detail','문샷 과정 자세히 보기',event.detailPath)}{event.kakaoUrl?link('consult','카카오 채널로 문의하기',event.kakaoUrl):<p className={styles.note}>상담 채널을 준비하고 있어요. 과정 안내에서 문의 방법을 확인해 주세요.</p>}</div>
  <p className={styles.returnNote}>안내는 새 창에서 열려요. 돌아오면 이 공간에서 계속 둘러볼 수 있어요.</p>
  {demo&&<p className={styles.note}>동작 미리보기 · 외부 이동·결제·회원 정보 조회 없음</p>}
 </article>;
}
function CourseDetail({event,demo,record}:{event:PublicWebinar;demo:boolean;record:(name:WebinarEvent)=>void}){return <section className={styles.invitation}><h2>문샷에서 배우는 것</h2><p>과정 구성과 실제 결과물, 준비 사항을 상세페이지에서 확인하세요.</p><div className={styles.courseLinks}><a href={event.detailPath} target="_blank" rel="noopener noreferrer" onClick={e=>{if(demo)e.preventDefault();record('detail');}}>상세페이지 크게 보기 ↗</a>{event.kakaoUrl&&<a href={event.kakaoUrl} target="_blank" rel="noopener noreferrer" onClick={e=>{if(demo)e.preventDefault();record('consult');}}>카카오 채널 문의 ↗</a>}</div>{demo?<p>DEV에서는 실제 행사에 연결한 상세페이지가 이 자리에 표시됩니다.</p>:<iframe className={styles.courseFrame} title="문샷 과정 상세페이지" src={event.detailPath} loading="lazy"/>}</section>;}

const examples={
 study:{title:'만든 결과를 함께 개선하는 시간',room:'study' as const,lines:[['질문 예시','광고 문구를 만들었는데 고객에게 와닿는지 모르겠어요.'],['동료 의견 예시','누구의 어떤 문제를 해결하는지 첫 문장부터 보여주면 어떨까요?']],next:'수업에서 만들고, 동료의 시선으로 개선하기'},
 office:{title:'배운 AI를 내 일에 연결하기',room:'office' as const,lines:[['질문 예시','AI로 만든 초안이 여러 곳에 흩어져 있어요.'],['활용 예시','할 일과 결과를 사무실에 모아 검토하고 다음 실행으로 연결해 보세요.']],next:'내 AI 사무실에서 할 수 있는 일'},
 welcome:{title:'처음이라도, 시작은 작게',room:'welcome' as const,lines:[['질문 예시','AI를 처음 사용하는데 따라갈 수 있을까요?'],['안내 예시','개강 전 안내와 짧은 퀴즈로 준비하고, 수업에서는 내 일에 하나씩 적용해 봐요.']],next:'문샷의 학습 흐름 알아보기'},
};
function Story({topic,event,demo,record}:{topic:string;event:PublicWebinar;demo:boolean;record:(name:WebinarEvent)=>void;onExplore?:()=>void}){
 const story=examples[topic as keyof typeof examples]||examples.study;
 return <section className={styles.invitation}><small>수업 속 대화 예시 · 실제 참여자 발언이나 수강 후기가 아닙니다.</small><h2>{story.title}</h2><div className={styles.exampleConversation}>{story.lines.map(([label,line])=><div key={label}><small>{label}</small><p>{line}</p></div>)}</div><p>이런 과정을 내 일에 적용해 보고 싶다면, 수업 구성과 필요한 준비를 먼저 확인해 보세요.</p><SpaceInvitation room={story.room} event={event} demo={demo} record={record}/></section>;
}
