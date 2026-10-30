'use client';
import { useEffect, useState } from 'react';
import './curriculum-ai.css';
type Row={cohort_id:string|null;cohort_name:string;course_title:string;requests:number;succeeded:number;failed:number;pending:number;calls:{api_calls?:number;input_tokens?:number;cached_tokens?:number;output_tokens?:number;estimated_usd?:number;unmeasured_calls?:number;unpriced_calls?:number}};
const number=(value:number|undefined)=>Number(value || 0).toLocaleString('ko-KR');
export function AdminAiUsage() {
 const [days,setDays]=useState(30),[cohort,setCohort]=useState(''),[retry,setRetry]=useState(0),[state,setState]=useState<{key:string;rows?:Row[];error?:string}|null>(null);
 const [open,setOpen]=useState(false);
 const key=`${days}:${retry}`;
 useEffect(()=>{if(!open)return;const abort=new AbortController();
  void fetch('/api/admin/ai-usage?days='+days,{cache:'no-store',signal:abort.signal}).then(async r=>{const body=await r.json();if(!r.ok || !Array.isArray(body.rows))throw new Error(body.error || '사용량을 확인하지 못했습니다.');if(!abort.signal.aborted)setState({key,rows:body.rows});}).catch(e=>{if(!abort.signal.aborted)setState({key,error:e.message});});
  return()=>abort.abort();
 },[days,retry,key,open]);
 const current=state?.key===key?state:null,rows=current?.rows?.filter(r=>!cohort || r.cohort_id===cohort);
 return <details className="panel pad mb24" onToggle={event=>setOpen(event.currentTarget.open)}><summary>기수별 AI API 사용량</summary><p className="meta">커리큘럼 AI 질문·멘토 초안의 서버 기록입니다. 요청 수와 API 호출 수는 다를 수 있습니다. 비용은 기록된 토큰과 당시 단가로 계산한 USD 추정치이며 실제 청구서와 다를 수 있습니다. 실패·시간 초과 등 측정할 수 없는 호출은 0원으로 계산하지 않습니다.</p>
  <div className="row"><label>기간 <select aria-label="AI 사용량 기간" value={days} onChange={e=>{setDays(Number(e.target.value));setCohort('');}}>{[1,7,30,90].map(d=><option key={d} value={d}>최근 {d}일</option>)}</select></label><label>기수 <select aria-label="AI 사용량 기수" value={cohort} onChange={e=>setCohort(e.target.value)}><option value="">전체 기수</option>{current?.rows?.filter(r=>r.cohort_id).map(r=><option key={r.cohort_id} value={r.cohort_id!}>{r.course_title} · {r.cohort_name}</option>)}</select></label><button type="button" className="btn" onClick={()=>setRetry(v=>v+1)}>사용량 새로고침</button></div>
  {current?.error?<p role="alert">{current.error}</p>:!rows?<p role="status">AI 사용량을 불러오고 있습니다.</p>:!rows.length?<p>선택한 기간에 기록된 AI 요청이 없습니다.</p>:<div className="ai-usage-table"><table><caption>기수별 요청·호출·토큰·비용</caption><thead><tr>{['과정·기수','질문·초안 요청','완료 / 실패 / 대기','API 호출','입력 / 캐시 토큰','출력 토큰','USD 추정 비용'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.cohort_id || 'deleted'}><th scope="row">{r.course_title}<br/>{r.cohort_name}</th><td>{number(r.requests)}</td><td>{number(r.succeeded)} / {number(r.failed)} / {number(r.pending)}</td><td>{number(r.calls.api_calls)}{Boolean(r.calls.unmeasured_calls)&&<small><br/>토큰 미확인 {number(r.calls.unmeasured_calls)}건</small>}</td><td>{number(r.calls.input_tokens)} / {number(r.calls.cached_tokens)}</td><td>{number(r.calls.output_tokens)}</td><td>${Number(r.calls.estimated_usd || 0).toFixed(4)}{Boolean(r.calls.unpriced_calls)&&<small><br/>금액 미확인 {number(r.calls.unpriced_calls)}건 별도</small>}</td></tr>)}</tbody></table></div>}
 </details>;
}
