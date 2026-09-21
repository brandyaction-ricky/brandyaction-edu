'use client';
import { useEffect, useRef, useState } from 'react';
import { WebinarBroadcastManagement } from './webinar-broadcast-management';
import { AdminButton, AdminInput, AdminSection, AdminSelect } from './final/admin-system';
import type { FunnelCourse, FunnelCohort } from '@/lib/recruitment-funnel';
type Campaign={id:string;freeCourse:string;paidCohort:string|null;enabled:boolean;revision:number};
type Report={campaign:Campaign|null;registrations:number;purchase_state:string;purchases:null|{orders:number;buyers:number;gross:number;refunds:number;net:number;needs_review:number;as_of:string}};
export function WebinarManagement({period,courses,cohorts}:{period:string;courses:FunnelCourse[];cohorts:FunnelCohort[]}) {
 const [report,setReport]=useState<Report|null>(null),[free,setFree]=useState(''),[paid,setPaid]=useState(''),[enabled,setEnabled]=useState(false),[pending,setPending]=useState(true),[message,setMessage]=useState(''),[origin,setOrigin]=useState(''),[refresh,setRefresh]=useState(0);
 const busy=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/conversion/webinar?period=${encodeURIComponent(period)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error);
   if(!controller.signal.aborted){setReport(data);setFree(data.campaign?.freeCourse??'');setPaid(data.campaign?.paidCohort??'');setEnabled(data.campaign?.enabled??false);setOrigin(location.origin);}
  }).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>controller.abort();
 },[period,refresh]);
 const save=async()=>{
  if(busy.current||!report)return;busy.current=true;setPending(true);setMessage('');
  try{
   const response=await fetch('/api/conversion/webinar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({period,freeCourse:free,paidCohort:paid||null,enabled,expected:report.campaign?.revision??0})});
   const data=await response.json();if(!response.ok){setReport(null);throw new Error(data.error);}
   setReport(data);setMessage('신청 설정을 저장했습니다. 링크를 게시하거나 안내 메시지를 발송하지는 않았습니다.');
  }catch(e){setMessage((e as Error).message);}finally{busy.current=false;setPending(false);}
 };
 return <AdminSection title="무료 신청·구매 연결" description="무료 웨비나는 기수 없이 신청을 받습니다." bordered>
  <fieldset disabled={pending||!report}>
   <legend>신청 대상 연결</legend>
   <AdminSelect label="웨비나 무료 상품" value={free} onChange={e=>setFree(e.target.value)}><option value="">공개된 무료 상품 선택</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</AdminSelect>
   <AdminSelect label="구매를 확인할 유료 기수" value={paid} onChange={e=>setPaid(e.target.value)}><option value="">미연결 · 확정 후 연결</option>{cohorts.map(c=><option key={c.id} value={c.id}>{courses.find(s=>s.id===c.course_id)?.title} · {c.name}</option>)}</AdminSelect>
   <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> 무료 신청 링크 활성화</label>
  </fieldset>
  <p>기본 기수를 자동으로 4기로 간주하지 않습니다. 신청이 발생한 뒤에는 무료 상품과 이미 연결한 유료 기수를 바꿀 수 없습니다. 미연결 유료 기수는 이후 추가할 수 있습니다. 같은 유료 기수는 한 모집에만 연결합니다.</p>
  <AdminButton disabled={pending||!report||!free} onClick={()=>void save()}>웨비나 신청 설정 저장</AdminButton>
  <AdminButton disabled={pending} onClick={()=>{setPending(true);setReport(null);setMessage('');setRefresh(n=>n+1);}}>신청·구매 기록 새로고침</AdminButton>
  {report?.campaign&&<>
   <p>신청 링크: {report.campaign.enabled?'활성':'중지'} · 설정 버전 {report.campaign.revision}</p>
   {(['paid','organic','unknown'] as const).map(channel=><AdminInput key={channel} label={`${channel==='paid'?'광고 방':channel==='organic'?'오가닉 방':'출처 미지정'} 신청 링크`} readOnly value={`${origin}/webinar/${report.campaign!.id}/${channel}`}/>)}
   <p>신청 {report.registrations}건 · 웨비나 실제 참여: 미확인</p>
   {report.purchases?<>
    <p>신청 이후 유료 구매자 {report.purchases.buyers}명 · 결제 주문 {report.purchases.orders}건</p>
    <p>결제 {report.purchases.gross.toLocaleString()}원 − 환불 {report.purchases.refunds.toLocaleString()}원 = 순매출 {report.purchases.net.toLocaleString()}원</p>
    <p>집계 제외·검토 필요 주문 {report.purchases.needs_review}건 · 조회 기준 {report.purchases.as_of}</p>
   </>:<p>{report.purchase_state==='forbidden'?'구매 조회에는 주문 관리 권한이 필요합니다.':'유료 기수 연결 전 · 구매 실적 미확인'}</p>}
   <p>현재 모집 신청자와 동일한 회원 계정의 신청 이후 결제만 관찰합니다. 해당 유료 기수의 전체 매출·광고 효과·1차/앵콜 전환율이 아닙니다. 0원 주문은 유료 구매에서 제외하고, 여러 상품이 포함된 주문과 결제 증거가 맞지 않는 주문은 검토 대상으로 구분합니다. 환불은 조회 시점의 누적액입니다.</p>
  </>}
  {report?.campaign&&<WebinarBroadcastManagement key={report.campaign.id} code={report.campaign.id}/>}
  {message&&<p role="status">{message}</p>}
 </AdminSection>;
}
