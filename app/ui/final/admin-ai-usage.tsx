'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import './admin-ai-usage.css';
type Row={cohort_id:string|null;cohort_name:string;course_title:string;requests:number;succeeded:number;failed:number;pending:number;calls:{api_calls?:number;input_tokens?:number;cached_tokens?:number;output_tokens?:number;estimated_usd?:number;unmeasured_calls?:number;unpriced_calls?:number}};
const number=(value:number|undefined)=>Number(value || 0).toLocaleString('ko-KR');
const money=(value:number|undefined)=>'$'+Number(value || 0).toFixed(4);
export function AdminAiUsage() {
 const [days,setDays]=useState(30),[cohort,setCohort]=useState(''),[retry,setRetry]=useState(0),[state,setState]=useState<{key:string;rows?:Row[];error?:string}|null>(null);
 const [open,setOpen]=useState(false);
 const key=`${days}:${retry}`;
 useEffect(()=>{if(!open)return;const abort=new AbortController();
  void fetch('/api/admin/ai-usage?days='+days,{cache:'no-store',signal:abort.signal}).then(async r=>{const body=await r.json();if(!r.ok || !Array.isArray(body.rows))throw new Error(body.error || '사용량을 확인하지 못했습니다.');if(!abort.signal.aborted)setState({key,rows:body.rows});}).catch(e=>{if(!abort.signal.aborted)setState({key,error:e.message});});
  return()=>abort.abort();
 },[days,retry,key,open]);
 const current=state?.key===key?state:null,rows=current?.rows?.filter(r=>!cohort || r.cohort_id===cohort);
 const totals=rows?.reduce((sum,r)=>({requests:sum.requests+r.requests,succeeded:sum.succeeded+r.succeeded,failed:sum.failed+r.failed,pending:sum.pending+r.pending,calls:sum.calls+Number(r.calls.api_calls || 0),input:sum.input+Number(r.calls.input_tokens || 0),output:sum.output+Number(r.calls.output_tokens || 0),cost:sum.cost+Number(r.calls.estimated_usd || 0),unmeasured:sum.unmeasured+Number(r.calls.unmeasured_calls || 0),unpriced:sum.unpriced+Number(r.calls.unpriced_calls || 0)}),{requests:0,succeeded:0,failed:0,pending:0,calls:0,input:0,output:0,cost:0,unmeasured:0,unpriced:0});
 return <details className="panel mb24 ai-usage" onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary className="ai-usage-heading"><span><strong>기수별 AI API 사용량</strong><small>학생 질문과 멘토 초안의 사용량을 확인하세요.</small></span><ChevronDown size={20} aria-hidden="true"/></summary>
  <div className="ai-usage-body">
   <div className="ai-usage-filters"><label><span>조회 기간</span><select aria-label="AI 사용량 기간" value={days} onChange={e=>{setDays(Number(e.target.value));setCohort('');}}>{[1,7,30,90].map(d=><option key={d} value={d}>최근 {d}일</option>)}</select></label><label><span>조회 기수</span><select aria-label="AI 사용량 기수" value={cohort} onChange={e=>setCohort(e.target.value)}><option value="">전체 기수</option>{current?.rows?.filter(r=>r.cohort_id).map(r=><option key={r.cohort_id} value={r.cohort_id!}>{r.course_title} · {r.cohort_name}</option>)}</select></label><button type="button" className="btn" disabled={open && !current} onClick={()=>setRetry(v=>v+1)}><RefreshCw size={16} aria-hidden="true"/>사용량 새로고침</button></div>
   {current?.error?<p role="alert" className="ai-usage-message ai-usage-error">{current.error}</p>:!rows?<p role="status" className="ai-usage-message">AI 사용량을 불러오고 있습니다.</p>:!rows.length?<p className="ai-usage-message">선택한 기간에 기록된 AI 요청이 없습니다.</p>:totals&&<>
    <dl className="ai-usage-metrics" aria-label="선택 범위 AI 사용량 요약">
     <div><dt>질문·초안 요청</dt><dd>{number(totals.requests)}<small>건</small></dd><span>완료 {number(totals.succeeded)} · 실패 {number(totals.failed)} · 대기 {number(totals.pending)}</span></div>
     <div><dt>API 호출</dt><dd>{number(totals.calls)}<small>회</small></dd><span>{totals.unmeasured?`토큰 미확인 ${number(totals.unmeasured)}건 포함`:'실제 서버 호출 기준'}</span></div>
     <div><dt>전체 토큰</dt><dd>{number(totals.input+totals.output)}</dd><span>입력 {number(totals.input)} · 출력 {number(totals.output)}</span></div>
     <div><dt>기록된 추정 비용</dt><dd className="ai-usage-cost">{totals.unpriced && totals.calls<=totals.unpriced?'집계 대기':money(totals.cost)}</dd><span>{totals.unpriced?`금액 미확인 ${number(totals.unpriced)}건 제외`:'USD · 실제 청구액과 다를 수 있음'}</span></div>
    </dl>
    <div className="ai-usage-section-heading"><h3>기수별 상세</h3><span>{rows.length}개 기수 · 최근 {days}일</span></div>
    <div className="ai-usage-detail"><table><caption>기수별 요청·호출·토큰·비용</caption><thead><tr>{['과정·기수','질문·초안 요청','처리 현황','API 호출','토큰 내역','USD 추정 비용'].map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.cohort_id || 'deleted'}>
     <th scope="row"><strong>{r.course_title}</strong><span>{r.cohort_name}</span></th>
     <td data-label="질문·초안 요청"><b>{number(r.requests)}</b><small>건</small></td>
     <td data-label="처리 현황" className="ai-usage-status"><span>완료 {number(r.succeeded)}</span><span className={r.failed?'ai-usage-failed':''}>실패 {number(r.failed)}</span><span>대기 {number(r.pending)}</span></td>
     <td data-label="API 호출"><b>{number(r.calls.api_calls)}</b><small>회</small>{Boolean(r.calls.unmeasured_calls)&&<span className="ai-usage-caution">토큰 미확인 {number(r.calls.unmeasured_calls)}건</span>}</td>
     <td data-label="토큰 내역" className="ai-usage-tokens"><span>입력 <b>{number(r.calls.input_tokens)}</b></span><span>출력 <b>{number(r.calls.output_tokens)}</b></span><small>캐시 {number(r.calls.cached_tokens)} · 입력에 포함</small></td>
     <td data-label="USD 추정 비용"><b>{r.calls.unpriced_calls && Number(r.calls.api_calls || 0)<=r.calls.unpriced_calls?'집계 대기':money(r.calls.estimated_usd)}</b>{Boolean(r.calls.unpriced_calls)&&<span className="ai-usage-caution">금액 미확인 {number(r.calls.unpriced_calls)}건 별도</span>}</td>
    </tr>)}</tbody></table></div>
   </>}
   <details className="ai-usage-help"><summary>집계 기준과 비용 안내</summary><p>요청 수와 API 호출 수는 다를 수 있습니다. 전체 토큰은 입력과 출력의 합계이며 캐시 토큰은 입력에 포함됩니다. 비용은 기록된 토큰과 당시 단가로 계산한 USD 추정치이며 실제 청구서와 다를 수 있습니다. 실패·시간 초과 등 측정할 수 없는 호출은 0원으로 계산하지 않습니다.</p></details>
  </div>
 </details>;
}
