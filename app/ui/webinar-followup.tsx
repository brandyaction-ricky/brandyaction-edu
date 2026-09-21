'use client';
import { useEffect,useRef,useState } from 'react';
import { AdminButton,AdminSection,AdminSelect,AdminStack,AdminTextarea } from './final/admin-system';
type Draft={channel:'room'|'direct';purpose:'offer'|'encore';body:string;revision:number;updatedAt:string};
type Counts={total:number;candidate:number;inactive:number;order_hold:number;no_consent:number;no_phone:number};
type Report={drafts:Draft[];audienceState:'ready'|'forbidden'|'unmapped'|'paused'|'unavailable';counts:Counts|null;asOf:string};
function DraftEditor({code,channel,draft,saved}:{code:string;channel:Draft['channel'];draft?:Draft;saved:(report:Report)=>void}){
 const label=channel==='room'?'카톡방 공지':'문자·알림톡 개별 안내';
 const [purpose,setPurpose]=useState<Draft['purpose']>(draft?.purpose??'encore'),[body,setBody]=useState(draft?.body??''),[pending,setPending]=useState(false),[error,setError]=useState('');
 const busy=useRef(false);
 const save=async()=>{
  if(busy.current)return;busy.current=true;setPending(true);setError('');
  try{
   const response=await fetch('/api/conversion/followup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,channel,purpose,body,expected:draft?.revision??0})});
   const data=await response.json();if(!response.ok)throw new Error(data.error);saved(data);
  }catch(e){setError((e as Error).message);}finally{busy.current=false;setPending(false);}
 };
 return <AdminSection title={label} bordered>
  <AdminStack>
   <p>{channel==='room'?'방 전체에 보이는 공지입니다. 구매자도 포함되므로 미구매자만 대상으로 한 안내라고 표시하지 마세요. 광고방·오가닉방에 맞는 링크를 사용하세요.':'사이트 무료 신청자 중 개별 안내 검토 후보를 확인합니다. 방에만 입장한 익명 참여자와 실제 시청자는 확인할 수 없습니다.'}</p>
   <fieldset disabled={pending} style={{border:0,padding:0,minWidth:0}}><AdminStack>
    <AdminSelect label={`${label} 목적`} value={purpose} onChange={e=>setPurpose(e.target.value as Draft['purpose'])}><option value="encore">앵콜 라이브 안내</option><option value="offer">유료 교육 안내</option></AdminSelect>
    <AdminTextarea aria-label={`${label} 초안`} label={`${label} 초안`} value={body} onChange={e=>setBody(e.target.value)} maxLength={2000} rows={5} helper="최대 2,000자. 고객 이름·전화번호 등 개인정보 없이 공통 문구만 저장하세요."/>
    <AdminButton disabled={pending||!body.trim()} onClick={()=>void save()}>{label} 초안 저장</AdminButton>
   </AdminStack></fieldset>
   <p>{draft?`저장 버전 ${draft.revision} · 미발송 초안`:'저장된 초안 없음'}</p>
   {error&&<p role="alert">{error}</p>}
  </AdminStack>
 </AdminSection>;
}
export function WebinarFollowup({code}:{code:string}){
 const [report,setReport]=useState<Report|null>(null),[pending,setPending]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/conversion/followup?code=${encodeURIComponent(code)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error);if(!controller.signal.aborted)setReport(data);
  }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>controller.abort();
 },[code,refresh]);
 const reload=()=>{setReport(null);setPending(true);setError('');setRefresh(n=>n+1);};
 return <AdminSection title="후속 CRM 안내 준비" description="카톡방 공지와 개별 안내를 따로 준비합니다. 초안 저장은 발송·예약·승인이 아닙니다." bordered>
  <AdminStack>
   <p>게시·발송 전에 확정 일정과 활성 링크를 확인하세요. 문자·알림톡은 발송 채널의 템플릿·수신 조건을 별도로 검토해야 합니다. 현재 기능은 메시지 사업자나 자동 발송에 연결하지 않습니다.</p>
   {report&&<>
    <h3>개별 안내 대상 사전 점검</h3>
    {report.counts?<>
     <p>사이트 무료 신청 {report.counts.total}명 중 개별 안내 검토 후보 {report.counts.candidate}명</p>
     <p>회원 미연결·비활성 {report.counts.inactive}명 · 구매·주문 검토로 제외 {report.counts.order_hold}명 · 수신 동의 확인 필요 {report.counts.no_consent}명 · 휴대전화 확인 필요 {report.counts.no_phone}명</p>
     <p>제외 사유는 위 순서로 한 가지씩 집계합니다. 구매·주문 검토에는 신청 전 구매, 결제 진행, 환불 및 결제 정보 확인이 필요한 주문도 포함합니다. 후보는 발송 확정 대상이 아니며 번호 소유·수신 가능 여부는 검증하지 않았습니다.</p>
    </>:<p>{({forbidden:'개별 대상 조회·초안 저장에는 회원·주문 권한이 추가로 필요합니다.',unmapped:'유료 기수 연결 전 · 개별 안내 대상 미확인',paused:'모집이 중지되어 개별 안내 대상 점검을 보류합니다.',unavailable:'연결한 유료 상품이 공개 상태인지 확인해 주세요.',ready:'대상을 확인하지 못했습니다.'})[report.audienceState]}</p>}
    <p>조회 기준 {report.asOf}. 다시 확인 버튼은 저장하지 않은 초안을 지우고 현재 상태를 다시 불러옵니다. 실제 발송 직전 구매·수신 거부·중복 발송 여부를 다시 확인하는 연결은 후속 단계입니다. 후보 수를 카톡방 인원이나 시청자 수로 해석하지 않습니다.</p>
    {(['room','direct'] as const).filter(channel=>channel==='room'||report.audienceState!=='forbidden').map(channel=><DraftEditor key={`${code}:${channel}:${report.drafts.find(d=>d.channel===channel)?.revision??0}`} code={code} channel={channel} draft={report.drafts.find(d=>d.channel===channel)} saved={setReport}/>)}
   </>}
   <AdminButton disabled={pending} onClick={reload}>후속 안내 초안·대상 다시 확인</AdminButton>
   {error&&<p role="alert">{error}</p>}
  </AdminStack>
 </AdminSection>;
}
