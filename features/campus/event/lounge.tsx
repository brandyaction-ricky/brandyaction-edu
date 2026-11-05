'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {Gift,Download,Ticket,ArrowRight,ArrowLeft,CheckCircle2,LockKeyhole} from 'lucide-react';
import {eventPath,invitePattern,type EventView} from './model';
import styles from './event.module.css';
const won=(n:number)=>new Intl.NumberFormat('ko-KR').format(n)+'원';
export const eventDate=(v:string|null)=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})+' (한국 시간)':'쿠폰에 표시된 기한까지';
export function EventLounge({initial,signedIn,invite}:{initial:EventView;signedIn:boolean;invite:string}){
 const [view,setView]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');const auto=useRef(false),lock=useRef(false);
 async function claim(action:'claim'|'live'){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{const r=await fetch('/api/campus/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:view.slug,invite,action})});const d=await r.json();if(!r.ok)throw Error(d.error);setView(d);if(d.claimed)history.replaceState(null,'',eventPath(view.slug));}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 useEffect(()=>{if(signedIn&&!initial.claimed&&(initial.sharedLink||invitePattern.test(invite))&&!auto.current){auto.current=true;void claim('claim');}},[signedIn,initial.claimed,initial.sharedLink,invite]); // eslint-disable-line react-hooks/exhaustive-deps
 const back=eventPath(view.slug)+(invitePattern.test(invite)?'?invite='+invite:'');
 const discount=view.quote?.couponDiscount||0;
 return <main className={styles.lounge}><div className={styles.inner}>
  <nav className={styles.nav}><Link href="/">MOONSHOT CAMPUS</Link><Link href="/"><ArrowLeft size={16}/> 나가기</Link></nav>
  <header className={styles.hero}><span className={styles.eyebrow}><Gift size={16}/> WINNER’S LOUNGE</span><h1>{view.title}</h1><p>{view.description||'당첨을 축하합니다! 특별한 자료와 문샷 수강 혜택을 준비했어요.'}</p><div className={styles.badges}><span>이벤트 전용 자료</span>{view.claimed&&<><span>10만원 쿠폰 지급 완료</span><span>라이브 쿠폰 중복 가능</span></>}</div></header>
  {!view.claimed?<section className={styles.entry}><LockKeyhole size={32}/><h2>이벤트 자료를 받아보세요</h2><p>로그인하면 당첨 자료를 내 계정에 보관해요.<br/>다시 방문해도 자료를 꺼내 볼 수 있어요.</p>{signedIn?<button className={styles.primary} disabled={busy} onClick={()=>void claim('claim')}>{busy?'혜택을 계정에 담고 있어요…':'당첨 혜택 받기'} <ArrowRight size={18}/></button>:<a className={styles.primary} href={'/login?next='+encodeURIComponent(back)}>로그인하고 이벤트 자료 받기 <ArrowRight size={18}/></a>}<small>처음 방문하셨다면 회원가입 후 이 화면으로 돌아와요.<br/>수령 마감: {eventDate(view.claimEndsAt)}</small></section>:<>
   <div className={styles.confirm} role="status"><CheckCircle2 size={22}/><div><strong>10만원 쿠폰이 내 계정에 지급됐어요.</strong><p>{view.liveOwned?'라이브 30만원 쿠폰도 받았어요. 아래에서 적용 가능한 할인 금액을 확인하세요.':view.liveAvailable?'아래 버튼을 눌러 라이브 30만원 쿠폰까지 받으면, 두 쿠폰을 함께 사용할 수 있어요.':'아래에서 보유 쿠폰과 사용 가능한 할인 금액을 확인하세요.'}</p></div></div>
   <div className={styles.columns}><section className={styles.card}><span className={styles.eyebrow}>01 · YOUR GIFT</span><h2>이벤트 자료 받기</h2><p>다운로드하고 내 일에 바로 활용해 보세요.</p>{view.resources.length?view.resources.map(r=><article key={r.id} className={styles.resource}><Download size={22}/><div><h3>{r.title}</h3><p>{r.description}</p><small>{r.fileName}</small><a className={styles.secondary} href={'/api/campus/event?slug='+view.slug+'&file='+r.id}>자료 다운로드 <Download size={16}/></a></div></article>):<p className={styles.empty}>당첨 자료를 준비하고 있어요. 등록되면 이곳에서 받을 수 있습니다.</p>}</section>
   <section className={styles.card}><span className={styles.eyebrow}>02 · YOUR BENEFIT</span><h2>내 계정에 담긴 할인 혜택</h2><div className={styles.ticket}><Ticket/><div><small>지급 완료 · 따로 받을 필요 없어요</small><strong>100,000<span>원</span></strong></div></div><p className={styles.expiry}>사용 기한: {eventDate(view.couponEndsAt)}</p><div className={styles.live}><span className={styles.step}>{view.liveOwned?'수령 완료':'다음 단계'}</span><h3>{view.liveOwned?'라이브 30만원 쿠폰도 받았어요':'버튼을 눌러 30만원 쿠폰도 받으세요'}</h3><p>{view.liveOwned?'10만원 + 30만원, 두 쿠폰을 함께 사용할 수 있어요.':'10만원은 이미 지급됐어요. 라이브 쿠폰은 아래 버튼을 눌러야 추가로 지급돼요.'}</p><p className={styles.total}>두 쿠폰을 함께 쓰면 <strong>총 40만원 할인</strong></p><p>라이브 참여 코드 <code>1108</code></p>{view.liveOwned?<span className={styles.owned}><CheckCircle2 size={17}/> 라이브 쿠폰 수령 완료</span>:<button className={styles.primary} disabled={busy||!view.liveAvailable} onClick={()=>void claim('live')}>{busy?'30만원 쿠폰을 받고 있어요…':view.liveAvailable?'30만원 더 받고 · 총 40만원 할인받기':'현재 라이브 쿠폰을 발급할 수 없습니다'}</button>}<small>라이브 쿠폰 기한: {eventDate(view.liveEndsAt)}</small></div></section></div>
   <section className={styles.conversion}><div><span>지금 적용 가능한 내 할인</span><strong>{won(discount)}</strong><p>{discount?'교육 과정과 최종 결제 금액을 확인해 보세요.':'보유 쿠폰의 사용 기한과 적용 조건을 확인해 주세요.'}</p></div><a className={styles.primary} href={view.detailPath+'?event='+view.slug} onClick={()=>{void fetch('/api/campus/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:view.slug,action:'detail'}),keepalive:true});}}>{discount?won(discount)+' 혜택으로 문샷 과정 보기':'문샷 과정 보기'}<ArrowRight size={19}/></a><small>지급받은 쿠폰은 내 계정에 보관돼요. 사용 기한 안에 다시 방문해도 사용할 수 있고, 결제 시 적용 가능한 쿠폰을 함께 반영합니다.</small></section>
  </>}{error&&<div role="alert" className={styles.error}>{error}</div>}<footer className={styles.footer}>MOONSHOT · 배운 것을 내 일의 성과로</footer>
 </div></main>;
}
