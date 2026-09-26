'use client';
import { RecruitmentCopyLink } from './recruitment-copy-link';
import { RecruitmentDetails, RecruitmentHelp } from './recruitment-help';
import { useEffect,useRef,useState } from 'react';
import { AdminButton,AdminCheckbox,AdminInput,AdminSection } from '@/features/admin-ui';
import { liveLabel,type LivePhase } from '@/lib/webinar-attendance';
import type { BroadcastReport,BroadcastSession } from '@/lib/broadcast-entry';
function Editor({code,phase,session,offerReady,origin,saved,campaignEnabled}:{code:string;phase:LivePhase;session?:BroadcastSession;offerReady:boolean;origin:string;saved:()=>void;campaignEnabled:boolean}){
 const [url,setUrl]=useState(session?.url??''),[enabled,setEnabled]=useState(session?.enabled??false),[offer,setOffer]=useState(session?.offerEnabled??false),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const busy=useRef(false);
 const dirty=url!==(session?.url??'')||enabled!==(session?.enabled??false)||offer!==(session?.offerEnabled??false);
 const blocked=pending?'저장 중입니다.':dirty?'변경한 방송 설정을 먼저 저장하세요.':!campaignEnabled?'모집이 중지되어 있습니다. 신청 설정을 확인하세요.':'';
 const save=async()=>{
  if(busy.current)return;busy.current=true;setPending(true);setMessage('');
  try{
   const response=await fetch('/api/conversion/broadcast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,phase,url,enabled,offerEnabled:offer,expected:session?.revision??0})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);saved();
  }catch(e){setMessage((e as Error).message);}finally{busy.current=false;setPending(false);}
 };
 return <fieldset disabled={pending}>
  <legend>{liveLabel(phase)}</legend>
  <AdminInput label={`${liveLabel(phase)} YouTube 주소`} value={url} onChange={e=>setUrl(e.target.value)}/>
  <AdminCheckbox label={`${liveLabel(phase)} 방송 이동 링크 활성화`} checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>
  <AdminCheckbox label={`${liveLabel(phase)} 유료 교육 안내 링크 활성화`} checked={offer} disabled={!offerReady&&!offer} onChange={e=>setOffer(e.target.checked)}/>
  {!offerReady&&<p>유료 기수와 공개된 유료 상품 연결 후 교육 안내 링크를 활성화할 수 있습니다.</p>}
  <p>{session?`저장 버전 ${session.revision} · 방송 링크 ${session.enabled?'활성':'중지'} · 교육 안내 링크 ${session.offerEnabled?'활성':'중지'}`:'링크 설정 전'}</p>
  <AdminButton disabled={pending||(enabled&&!url.trim())||(offer&&!offerReady)} onClick={()=>void save()}>{liveLabel(phase)} 링크 설정 저장</AdminButton>
  {session&&(['paid','organic','unknown'] as const).map(channel=><div key={channel}>
   <RecruitmentCopyLink label={`${liveLabel(phase)} ${channel==='paid'?'광고방':channel==='organic'?'오가닉방':'공통'} 방송 링크`} value={origin ? `${origin}/go/${code}/${phase}/${channel}/live` : ''} blocked={blocked||(!session.enabled||!session.url?'방송 링크가 중지되었거나 주소가 없습니다. 저장 후 활성 상태를 확인하세요.':'')} usage={channel==='unknown'?'양쪽 방이 함께 보는 공통 안내에 사용하세요.':`${channel==='paid'?'광고방':'오가닉방'} 공지에 사용하세요.`}/>
   {offerReady&&<RecruitmentCopyLink label={`${liveLabel(phase)} ${channel==='paid'?'광고방':channel==='organic'?'오가닉방':'공통'} 교육 안내 링크`} value={origin ? `${origin}/go/${code}/${phase}/${channel}/offer` : ''} blocked={blocked||(!session.offerEnabled?'교육 안내 링크가 중지되어 있습니다. 활성화 후 복사하세요.':'')} usage={channel==='unknown'?'YouTube 방송 채팅 등 공통 안내에 사용하세요.':`${channel==='paid'?'광고방':'오가닉방'} 유료 교육 안내에 사용하세요.`}/>}
  </div>)}
  {message&&<p role="alert">{message} 최신 설정을 다시 불러와 주세요.</p>}
 </fieldset>;
}
export function WebinarBroadcastManagement({code,campaignEnabled}:{code:string;campaignEnabled:boolean}){
 const [report,setReport]=useState<BroadcastReport|null>(null),[pending,setPending]=useState(true),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0),[origin,setOrigin]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/conversion/broadcast?code=${encodeURIComponent(code)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted){setReport(data);setOrigin(location.origin);}
  }).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>controller.abort();
 },[code,refresh]);
 const reload=()=>{setReport(null);setPending(true);setMessage('');setRefresh(n=>n+1);};
 return <AdminSection className="recruitment-guidance" title="방송·교육 안내 링크" description="카톡방 링크를 누르면 로그인·출석 체크 없이 방송 또는 교육 상세페이지로 바로 이동합니다." bordered>
  <RecruitmentHelp title="링크 공유 방법"><p>광고방·오가닉방에는 해당 링크를, 양쪽이 함께 보는 방송 채팅에는 공통 링크를 사용하세요.</p><p>링크 종류는 안내 위치를 나타내며 실제 광고 유입이나 개인 신원을 증명하지 않습니다.</p><p>저장 후에도 카톡방 공지·광고에 자동 게시하지 않습니다.</p></RecruitmentHelp>
  {report&&(['first','encore'] as const).map(phase=><Editor key={`${phase}:${refresh}`} code={code} phase={phase} session={report.sessions.find(s=>s.phase===phase)} offerReady={report.offerReady} origin={origin} campaignEnabled={campaignEnabled} saved={reload}/>)}
  <h3>이동 요청 기록</h3>
  <RecruitmentDetails title="이동 요청은 시청자 수가 아닙니다 · 집계 기준"><p>출석·시청자·고유 인원이 아닙니다.</p><p>알려진 미리보기·사전 로딩 요청은 제외하지만 반복 방문과 일부 자동 요청이 포함될 수 있습니다.</p><p>분당 수집 한도 초과 시 이동은 허용하고 기록은 생략합니다.</p><p>고객 계정·IP·새 추적 쿠키는 저장하지 않습니다.</p></RecruitmentDetails>
  {report&&(['first','encore'] as const).map(phase=><div key={phase}><h4>{liveLabel(phase)}</h4>{(['live','offer'] as const).map(target=><p key={target}>{target==='live'?'방송 이동':'교육 상세 이동'} — {(['paid','organic','unknown'] as const).map(channel=>`${channel==='paid'?'광고방':channel==='organic'?'오가닉방':'공통'} ${report.counts.find(c=>c.phase===phase&&c.target===target&&c.channel===channel)?.requests??0}건`).join(' · ')}</p>)}</div>)}
  <RecruitmentDetails title="시청·구매 데이터 연결 범위"><p>YouTube 전체 시청 통계는 아직 연결하지 않았습니다.</p><p>기존 회원의 신청 이후 구매·환불 조회는 위 패널에 있으며, 이 이동 요청과 개인별로 연결하거나 첫·앵콜 구매 전환율로 계산하지 않습니다.</p><p>과거 출석 이력은 보존하며 추가 출석 체크는 사용하지 않습니다.</p></RecruitmentDetails>
  <AdminButton disabled={pending} onClick={reload}>방송 링크·기록 새로고침</AdminButton>
  {message&&<p role="alert">{message}</p>}
 </AdminSection>;
}
