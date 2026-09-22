'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminButton, AdminInput, AdminSection, AdminSelect, AdminStack } from '@/features/admin-ui';
import { RecruitmentDetails, RecruitmentHelp } from './recruitment-help';
type Setup={state:string;period:string;templates:{id:string;name:string;channel:string}[];reservations:{id:string;name:string;status:string;scheduledAt:string;error?:string}[];delivery:{enabled:boolean}};
type Review={token:string;asOf:string;counts:Record<string,number>;template:{name:string;content:string;channel:string}};
const reasons:Record<string,string>={order_hold:'구매·주문 확인',no_consent:'수신 동의 확인',inactive:'회원 미연결·비활성',no_phone:'휴대전화 확인',shared_phone:'여러 회원이 사용하는 번호',duplicate:'동일 목적 발송 시도 이력'};
export function RecruitmentDelivery({code}:{code:string}){
 const [setup,setSetup]=useState<Setup|null>(null),[review,setReview]=useState<Review|null>(null),[template,setTemplate]=useState(''),[purpose,setPurpose]=useState('encore');
 const [name,setName]=useState(''),[at,setAt]=useState(''),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
 const busy=useRef(false),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/conversion/delivery?code='+encodeURIComponent(code),{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!controller.signal.aborted)setSetup(d);}).catch(e=>{if(!controller.signal.aborted)setNotice(e.message);});
  return()=>controller.abort();
 },[code,refresh]);
 const clear=()=>{setReview(null);setConfirmed(false);setNotice('');};
 async function run(action:'review'|'schedule'|'cancel',cancel?:string){
  if(busy.current)return;busy.current=true;setPending(true);setNotice('');
  try{
   const params={code,template,purpose};
   const r=action==='review'?await fetch('/api/conversion/delivery?'+new URLSearchParams(params),{cache:'no-store'}):await fetch('/api/conversion/delivery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='cancel'?{code,cancel}:{...params,name,at:new Date(at).toISOString(),token:review?.token})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'처리하지 못했습니다.');
   if(!active.current)return;
   setConfirmed(false);
   if(action==='review')setReview(d);
   else{setReview(null);setRefresh(v=>v+1);setNotice(action==='cancel'?'예약을 취소했습니다.':'예약을 저장했습니다. 발송 기능이 활성화된 환경에서 예약 시각 이후 실행됩니다.');}
  }catch(e){if(active.current){setReview(null);setConfirmed(false);setNotice((e as Error).message);if(action!=='review')setRefresh(v=>v+1);}}
  finally{busy.current=false;if(active.current)setPending(false);}
 }
 return <AdminSection title="모집 신청자에게 개별 안내" description="이 모집에 사이트로 신청한 회원만 검토합니다. 카톡방 공지는 별도로 게시하세요." bordered className="recruitment-guidance">
  <AdminStack>
   <RecruitmentHelp title="검토 → 예약 → 발송 직전 재확인"><p>대상 검토는 발송하지 않습니다. 예약 버튼을 눌러야 발송 대기 상태가 됩니다.</p><p>{setup?.delivery.enabled?'외부 발송이 활성화되어 있습니다. 예약 시각 이후 실제로 전송됩니다.':'현재 외부 발송은 중지 상태입니다. 저장한 예약은 발송을 활성화하면 실행 대상이 됩니다.'}</p></RecruitmentHelp>
   {setup&&<>
    <p>대상 모집: {setup.period} · 사이트 신청자 기준</p>
    {setup.state!=='ready'&&<p role="status">{setup.state==='unavailable'?'연결된 유료 상품이 아직 공개되지 않아 대상 검토·예약을 보류합니다.':setup.state==='unmapped'?'유료 기수를 먼저 연결해 주세요.':'모집이 중지되어 대상 검토·예약을 보류합니다.'}</p>}
    <fieldset disabled={pending} style={{border:0,padding:0,minWidth:0}}><AdminStack>
     <AdminSelect label="개별 안내 목적" value={purpose} onChange={e=>{setPurpose(e.target.value);clear();}}><option value="encore">앵콜 라이브 안내</option><option value="offer">유료 교육 안내</option></AdminSelect>
     <AdminSelect label="발송에 사용할 템플릿" value={template} onChange={e=>{setTemplate(e.target.value);clear();}}><option value="">검토를 마친 활성 마케팅 템플릿 선택</option>{setup.templates.map(t=><option key={t.id} value={t.id}>{t.name} · {t.channel.toUpperCase()}</option>)}</AdminSelect>
     {!setup.templates.length&&<p>사용 가능한 템플릿이 없습니다. 메시지 템플릿에서 문구·채널을 검토하고 활성화한 뒤 다시 불러오세요.</p>}
     <AdminButton disabled={!template||setup.state!=='ready'||pending} onClick={()=>void run('review')}>발송 대상·문구 검토</AdminButton>
     {review&&<>
      <h3>검토 결과 · {review.counts.candidate}명</h3>
      <p>사이트 신청 {review.counts.total}명 중 아래 사유를 제외했습니다.</p>
      <ul>{Object.entries(reasons).map(([key,label])=><li key={key}>{label}: {review.counts[key]??0}명</li>)}</ul>
      <p>템플릿: {review.template.name} · {review.template.channel.toUpperCase()}</p>
      <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{review.template.content}</p>
      <p>조회 기준: {new Date(review.asOf).toLocaleString('ko-KR')}</p>
      <AdminInput label="모집 안내 예약 이름" maxLength={100} value={name} onChange={e=>{setName(e.target.value);setConfirmed(false);}}/>
      <AdminInput label="모집 안내 예약 시각 (현재 기기 시간)" type="datetime-local" value={at} onChange={e=>{setAt(e.target.value);setConfirmed(false);}}/>
      <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 대상 수·문구·시각을 확인했으며, 발송 활성화 시 실제 전송되는 예약을 저장합니다.</label>
      {(review.counts.candidate===0||review.counts.candidate>500)&&<p>예약은 검토 후보 1~500명일 때 가능합니다.</p>}
      <AdminButton disabled={pending||!confirmed||!name.trim()||!at||review.counts.candidate<1||review.counts.candidate>500} onClick={()=>void run('schedule')}>검토한 모집 안내 예약</AdminButton>
     </>}
    </AdminStack></fieldset>
    <RecruitmentDetails title="발송 전 확인 범위"><p>예약 당시 검토한 신청자만 대상으로 삼고, 이후 구매·주문 상태, 마케팅 수신 동의, 회원 상태, 전화번호와 중복 이력을 다시 확인합니다. 예약 후 새 신청자는 자동 추가되지 않습니다.</p><p>여러 회원이 같은 번호를 사용하면 모두 제외합니다. 같은 모집·같은 안내 목적의 발송 시도는 회원과 번호 기준으로 한 번만 허용합니다. 결과가 불명확해도 자동 재발송하지 않습니다.</p><p>모집 연결·문구·운영자 권한이 변경되면 발송을 중단합니다. 예약을 바꾸려면 취소 후 다시 검토하세요. YouTube 시청 여부와 카톡방 참여 여부는 개인별로 확인하지 않습니다.</p></RecruitmentDetails>
    {setup.reservations.length>0&&<><h3>이 모집의 예약 내역</h3>{setup.reservations.map(item=><div key={item.id}><p>{item.name} · {({scheduled:'예약 대기',sending:'발송 처리 중',completed:'처리 완료',failed:'검토 필요',cancelled:'취소됨'} as Record<string,string>)[item.status]||item.status} · {new Date(item.scheduledAt).toLocaleString('ko-KR')}</p>{item.error&&<p role="status">{item.error}</p>}{item.status==='scheduled'&&<AdminButton disabled={pending} onClick={()=>void run('cancel',item.id)}>예약 취소: {item.name}</AdminButton>}</div>)}</>}
   </>}
   <AdminButton disabled={pending} onClick={()=>{clear();setSetup(null);setRefresh(v=>v+1);}}>모집 안내 설정 다시 불러오기</AdminButton>
   {notice&&<p role="status">{notice}</p>}
  </AdminStack>
 </AdminSection>;
}
