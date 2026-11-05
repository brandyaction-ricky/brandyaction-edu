/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-location-assign-relative-destination -- Standalone static review app, not the Next.js router. */
// Isolated visual review only: no auth, Supabase, payment or message provider is connected.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {EventLounge} from '../../features/campus/event/lounge';
import {EventAdmin} from '../../features/campus/event/admin';
import {eventViewFixture} from './event';
import type {EventSettings,EventView} from '../../features/campus/event/model';
import '../../app/ui/final/tokens.css';
const id='00000000-0000-4000-8000-000000000001',key='moonshot-event-review';
const defaults:EventSettings={...eventViewFixture,cohortId:id,liveEndsAt:'2026-11-08T14:59:59.999Z',enabled:true,resources:[{id,title:'고객의 마음을 발견하는 AI 질문 모음',description:'내 사업에 맞는 질문을 골라 바로 실행해 보세요.',fileName:'문샷-이벤트-자료.txt',storagePath:`edu/campus-event/moonshot-winners-1108/${id}/${id}.txt`,published:true}]};
let settings:EventSettings=JSON.parse(localStorage.getItem(key)||'null')||defaults;
const state=()=>({claimed:localStorage.getItem(key+'-claim')==='1',live:localStorage.getItem(key+'-live')==='1'});
const view=():EventView=>({...eventViewFixture,...settings,claimed:state().claimed,liveOwned:state().live,resources:state().claimed?settings.resources:[],quote:state().claimed?{couponCode:state().live?'1108+WIN_PREVIEW':'WIN_PREVIEW',couponDiscount:state().live?400000:100000,totalAmount:state().live?600000:900000}:null});
window.fetch=async(input,init)=>{
 const path=String(input),body=JSON.parse(String(init?.body||'{}'));
 if(path.startsWith('/api/admin/campus/events')){
  if(!init?.method||init.method==='GET')return Response.json({zones:[{...settings,cohort_id:id,claim_ends_at:settings.claimEndsAt,revision:id}],cohorts:[{id,name:'5기 · 미리보기',courses:{title:'AI 문샷 챌린지'}}],counts:{awards:state().claimed?1:0},invites:[],liveCoupon:{discount_type:'fixed',discount_value:300000,is_active:true,is_draft:false}});
  if(body.action==='save'){settings=body.settings;localStorage.setItem(key,JSON.stringify(settings));return Response.json({ok:true});}
  if(body.action==='invite')return Response.json({links:Array.from({length:body.count},(_,i)=>({id:String(i),label:`당첨자 ${i+1}`,path:'/campus/event/'+settings.slug+'?invite='+'a'.repeat(64)}))});
  if(body.action==='upload')return Response.json({path:`edu/campus-event/${settings.slug}/${body.id}/${id}.txt`,token:'preview-only',contentType:'text/plain'});
  return Response.json({ok:true});
 }
 if(path==='/api/campus/event'){
  if(body.action==='claim')localStorage.setItem(key+'-claim','1');
  if(body.action==='live')localStorage.setItem(key+'-live','1');
  return Response.json(view());
 }
 return Response.json({error:'화면 미리보기에서는 연결하지 않는 기능입니다.'},{status:400});
};
function App(){
 const query=new URLSearchParams(location.search),admin=location.pathname.includes('/admin'),download=location.pathname==='/api/campus/event',detail=location.pathname.startsWith('/classes'),login=location.pathname==='/login';
 const signed=query.has('member')||localStorage.getItem(key+'-signed')==='1';
 if(login){localStorage.setItem(key+'-signed','1');location.replace(query.get('next')||'/');return null;}
 const nav=<div style={{background:'#fff7dd',padding:'12px 18px',fontFamily:'sans-serif',fontSize:14,lineHeight:1.7,color:'#563e0b'}}>화면·동선 미리보기 · 실제 계정·쿠폰·결제에는 반영되지 않습니다.<br/><a href="/">참여자 화면</a> · <a href="/admin/campus/events">관리자 화면</a> · <button onClick={()=>{localStorage.removeItem(key+'-claim');localStorage.removeItem(key+'-live');localStorage.removeItem(key+'-signed');location.assign('/');}}>수령 전으로 초기화</button></div>;
 if(download)return <>{nav}<main style={{padding:32}}><h1>자료 다운로드</h1><p>실제 서비스는 당첨 계정을 확인한 뒤 비공개 파일을 내려받습니다.</p><a download="문샷-이벤트-미리보기.txt" href={'data:text/plain;charset=utf-8,'+encodeURIComponent('문샷 이벤트 자료 다운로드 동선 미리보기입니다.')}>예시 파일 다운로드</a><p><a href="/">이벤트 존으로 돌아가기</a></p></main></>;
 if(detail)return <>{nav}<main style={{padding:32}}><h1>문샷 과정 상세페이지로 연결</h1><p>현재 내 할인: {(view().quote?.couponDiscount||0).toLocaleString()}원</p><p>실제 서비스에서는 해당 기수의 상세페이지와 결제로 이어지고, 보유한 중복 쿠폰이 자동 적용됩니다.</p><a href="/">이벤트 존으로 돌아가기</a></main></>;
 return <>{nav}{admin?<EventAdmin/>:<EventLounge initial={view()} signedIn={signed} invite={query.get('invite')||'a'.repeat(64)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
