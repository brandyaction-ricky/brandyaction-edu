'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { WebinarAttendance } from './webinar-attendance';
type State={revision:number;registered:boolean;authenticated:boolean;policy:string};
export function WebinarRegistration({code,channel}:{code:string;channel:string}) {
 const [data,setData]=useState<State|null>(null),[message,setMessage]=useState(''),[agreed,setAgreed]=useState(false),[pending,setPending]=useState(false);
 const busy=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(`/api/webinar?code=${encodeURIComponent(code)}&channel=${encodeURIComponent(channel)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const result=await response.json();if(!response.ok)throw new Error(result.error);if(!controller.signal.aborted)setData(result);
  }).catch(e=>{if(!controller.signal.aborted)setMessage(e.message);});
  return()=>controller.abort();
 },[code,channel]);
 const apply=async()=>{
  if(!data||!agreed||busy.current)return;
  busy.current=true;setPending(true);setMessage('');
  try{
   const response=await fetch('/api/webinar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,channel,agreed,policy:data.policy,expected:data.revision})});
   const result=await response.json();if(!response.ok)throw new Error(result.error);setData(result);
  }catch(e){setMessage((e as Error).message);}finally{busy.current=false;setPending(false);}
 };
 const returnTo=`/webinar/${code}/${channel}`;
 return <main style={{maxWidth:600,margin:'48px auto',padding:'24px',lineHeight:1.7}}>
  <p>BrandyAction EDU · 무료 웨비나</p><h1>AI 에이전트 마케팅 교육</h1>
  <p>무료 웨비나 신청을 현재 로그인한 회원 계정에 기록합니다. 유료 교육 결제와 수강권 발급은 별도입니다.</p>
  {!data&&!message&&<p role="status">신청 정보를 확인하고 있습니다.</p>}
  {data?.registered?<div role="status"><h2>신청이 완료되었습니다.</h2><p>라이브 일정과 참여 주소는 안내받은 카톡방 공지를 확인해 주세요.</p></div>:data&&!data.authenticated?<Link href={`/login?next=${encodeURIComponent(returnTo)}`}>로그인하고 무료 신청하기</Link>:data&&<form onSubmit={e=>{e.preventDefault();void apply();}}>
   <label style={{display:'block',margin:'20px 0'}}><input type="checkbox" checked={agreed} disabled={pending} onChange={e=>setAgreed(e.target.checked)}/> <Link href="/policies/terms" target="_blank">이용약관</Link>과 <Link href="/policies/privacy" target="_blank">개인정보 처리방침</Link>을 확인하고 무료 신청에 동의합니다.</label>
   <p>마케팅 수신 동의는 변경하지 않습니다.</p>
   <button type="submit" disabled={!agreed||pending} style={{padding:'16px 24px',borderRadius:12,background:agreed?'#e22400':'#777',color:'white',border:0,fontSize:17}}>{pending?'신청 중…':'무료 웨비나 신청하기'}</button>
  </form>}
  {data?.registered&&<WebinarAttendance key={code} code={code}/>}
  {message&&<p role="alert">{message} 페이지를 새로고침한 뒤 다시 확인해 주세요.</p>}
 </main>;
}
