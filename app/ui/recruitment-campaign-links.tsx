'use client';
import { RecruitmentDetails, RecruitmentHelp } from './recruitment-help';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminButton } from './final/admin-system';
type Item={id:string;name:string;start:string;end:string;usesAds:boolean;available?:boolean;valid?:boolean};
type Mapping={revision:number;freeCourse:string;webinarRevision:number;candidates:Item[];selected:Item[]};
export function RecruitmentCampaignLinks({period,view}:{period:string;view:string}) {
 const [data,setData]=useState<Mapping|null>(null),[ids,setIds]=useState<string[]>([]),[pending,setPending]=useState(true),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
 const busy=useRef(false),active=useRef(true);
 useEffect(()=>{
  active.current=true;const controller=new AbortController();
  void fetch('/api/conversion/marketing?period='+encodeURIComponent(period),{cache:'no-store',signal:controller.signal}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.error);if(!controller.signal.aborted){setData(value);setIds(value.selected.filter((item:Item)=>item.valid).map((item:Item)=>item.id));}}).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>{active.current=false;controller.abort();};
 },[period,reload]);
 const refresh=()=>{setPending(true);setData(null);setIds([]);setMessage('');setReload(n=>n+1);};
 const save=async()=>{
  if(!data||busy.current)return;busy.current=true;setPending(true);setMessage('');
  try{
   const r=await fetch('/api/conversion/marketing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({period,expected:data.revision,webinarRevision:data.webinarRevision,freeCourse:data.freeCourse,campaignIds:ids})});
   const value=await r.json();if(!r.ok)throw Error(value.error);
   if(active.current){setData(value);setIds(value.selected.filter((item:Item)=>item.valid).map((item:Item)=>item.id));setMessage('캠페인 연결을 저장했습니다. 결제 기록이나 발송 설정은 변경하지 않았습니다.');}
  }catch(e){if(active.current){setData(null);setMessage((e as Error).message);}}finally{busy.current=false;if(active.current)setPending(false);}
 };
 return <section className="recruitment-campaign-panel" hidden={!['settings','performance'].includes(view)} aria-label="모집별 마케팅 캠페인 연결">
  <h3>이 모집의 광고·오가닉 캠페인</h3>
  <RecruitmentHelp title="캠페인 연결 방법"><p>무료 상품이 같은 캠페인 중 이번 모집에 사용할 항목을 연결하세요.</p><p>같은 카톡방을 계속 써도 캠페인은 모집별로 구분합니다.</p></RecruitmentHelp>
  <div hidden={view!=='settings'}>
   {data&&<fieldset disabled={pending}><legend>연결할 캠페인 · 최대 20개</legend>
    {data.candidates.length?data.candidates.map(item=><label key={item.id} className="recruitment-campaign-choice"><input type="checkbox" checked={ids.includes(item.id)} disabled={!item.available} onChange={e=>setIds(current=>e.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/><span><strong>{item.name}</strong><small>{item.usesAds?'광고':'오가닉'} · {item.start} ~ {item.end}{!item.available?' · 다른 모집에 연결됨':''}</small></span></label>):<p>같은 무료 상품에 등록된 캠페인이 없습니다. 광고·웨비나 성과의 캠페인 설정에서 먼저 등록하세요.</p>}
    {data.selected.some(item=>!item.valid)&&<p role="alert">연결 후 상품이 변경된 캠페인이 있습니다. 현재 무료 상품에 맞는 캠페인을 다시 선택하고 저장하면 잘못 연결된 항목은 해제됩니다.</p>}
   </fieldset>}
   <AdminButton disabled={pending||!data||ids.length>20} onClick={()=>void save()}>모집 캠페인 연결 저장</AdminButton>
   {data&&ids.length===0&&<p>선택 없이 저장하면 현재 모집의 캠페인 연결만 해제됩니다. 캠페인과 실적은 삭제하지 않습니다.</p>}
  </div>
  {data&&<><p>저장 버전 {data.revision} · 연결된 캠페인 {data.selected.length}개</p>
   {data.selected.length?data.selected.map(item=><p key={item.id}>{item.valid?<Link scroll={false} href={'/admin/landing?'+new URLSearchParams({recruitment:period,course:data.freeCourse,campaign:item.id,preset:'7d'}).toString()}>{item.name} 성과 보기</Link>:<span>{item.name} · 상품 연결 재확인 필요</span>} · {item.usesAds?'광고':'오가닉'} · {item.start} ~ {item.end}</p>):<p>아직 연결된 캠페인이 없습니다. 1. 신청·상품 연결에서 선택 후 저장하세요.</p>}
  </>}
  <AdminButton disabled={pending} onClick={refresh}>모집 캠페인 연결 다시 불러오기</AdminButton>
  {pending&&<p role="status">캠페인 연결을 확인하고 있습니다.</p>}{message&&<p role="status">{message}</p>}
  <RecruitmentDetails title="캠페인 성과와 구매 집계의 차이"><p>캠페인별 방문·클릭·광고비·수동 실측과 아래 회원 신청 이후 실제 결제는 서로 다른 집계입니다.</p><p>합산하거나 광고 구매 귀속으로 해석하지 않습니다.</p><p>연결은 고객의 과거 유입 기록을 바꾸지 않습니다.</p></RecruitmentDetails>
 </section>;
}
