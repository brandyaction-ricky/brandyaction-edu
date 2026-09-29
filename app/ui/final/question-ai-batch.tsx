'use client';
import { useEffect, useRef, useState } from 'react';
import type { QuestionAiReference } from '@/lib/question-ai-context';
import { QuestionThreadDialog } from './question-thread';
import { QuestionAiReferenceNote } from './question-ai-reference';
import { useUnsavedLearningChanges } from './use-unsaved-learning-changes';
type Candidate = { id: string; title: string; content: string; learning_context?: string; image_id?: string };
type Entry = Candidate & { state: 'queued'|'working'|'draft'|'failed'|'skipped'|'saved'; draft: string; error?: string; reference?: QuestionAiReference };
async function fetchJson(url: string, body?: unknown) {
 const response = await fetch(url,{method:body ? 'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(body ? 60000 : 10000),...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
 const result = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error || '초안을 확인하지 못했습니다.'),{status:response.status}); return result;
}
export function QuestionAiBatch({ changed }: { changed?: () => void }) {
 const [open,setOpen] = useState(false), [entries,setEntries] = useState<Entry[]>([]), [busy,setBusy] = useState(false), [notice,setNotice] = useState(''), [selected,setSelected] = useState<string|null>(null), [stopping,setStopping] = useState(false);
 const gate=useRef(false),stop=useRef(false),alive=useRef(false),cache=useRef(new Map<string,Entry>());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true;};},[]);
 useUnsavedLearningChanges(busy || entries.some(e=>Boolean(e.draft)));
 function patch(id: string, values: Partial<Entry>) { const old=cache.current.get(id); if(!old || !alive.current)return;cache.current.set(id,{...old,...values});setEntries([...cache.current.values()]); }
 async function run() {
  if(gate.current)return;gate.current=true;stop.current=false;setBusy(true);setStopping(false);setNotice('미답변 질문을 불러오고 있습니다.');let cursor: string|null=null,snapshot='',done=0,failed=0,skipped=0;
  const seen=new Set<string>();
  try {
   do {
    const params=new URLSearchParams({...cursor ? {cursor} : {},...snapshot ? {snapshot} : {}});
    const page=await fetchJson('/api/admin/questions/answer-drafts?'+params);
    if(!alive.current || stop.current)break;
    if(!Array.isArray(page.rows) || typeof page.snapshot!=='string' || (snapshot && snapshot!==page.snapshot))throw new Error('질문 목록의 조회 기준이 바뀌었습니다. 다시 시도해 주세요.');
    snapshot=page.snapshot;
    const targets:Candidate[]=page.rows.filter((q:Candidate)=>!cache.current.get(q.id)?.draft && cache.current.get(q.id)?.state!=='saved');
    for(const q of targets)cache.current.set(q.id,{...q,state:'queued',draft:''});setEntries([...cache.current.values()]);
    let next=0;
    async function worker(){while(!stop.current && alive.current && next<targets.length){const q=targets[next++];patch(q.id,{state:'working',error:undefined});
     try {const result=await fetchJson('/api/admin/questions/answer-draft',{questionId:q.id,requireUnanswered:true});if(typeof result.draft!=='string' || !result.draft.trim())throw new Error('빈 초안이 반환됐습니다.');patch(q.id,{state:'draft',draft:result.draft,reference:result.reference});done++;}
     catch(e){const err=e as {message:string;status?:number};if(err.status===409){skipped++;patch(q.id,{state:'skipped',error:err.message});}else{failed++;patch(q.id,{state:'failed',error:err.message});}}
     if(alive.current)setNotice(`초안 ${done}개 준비 · 실패 ${failed}개 · 최신 상태 확인 ${skipped}개`);
    }}
    await Promise.all([worker(),worker()]);
    cursor=page.nextCursor || null;if(cursor){if(typeof cursor!=='string' || seen.has(cursor))throw new Error('질문 목록을 계속 불러오지 못했습니다. 다시 시도해 주세요.');seen.add(cursor);}
   }while(cursor && !stop.current && alive.current);
   if(alive.current)setNotice((stop.current?'중지했습니다. ':'미답변 목록 확인을 마쳤습니다. ')+`초안 ${done}개 준비 · 실패 ${failed}개 · 최신 상태 확인 ${skipped}개. 만든 초안은 남아 있으며 개별 검토 후 등록해 주세요.`);
  }catch(e){if(alive.current)setNotice((e as Error).message+' 이미 만든 초안은 남아 있습니다.');}
  finally{gate.current=false;if(alive.current){setBusy(false);setStopping(false);}}
 }
 const active=entries.find(e=>e.id===selected);
 return <section className="panel pad mb24" aria-label="미답변 AI 초안 작업">
  <button type="button" className="btn" onClick={()=>setOpen(v=>!v)}>{open?'AI 초안 작업 접기':'미답변 AI 초안'}</button>
  {open&&<div className="mt16"><p>모든 미답변 질문의 초안을 준비합니다. 만든 초안은 이 화면에만 보관되며, 답변은 하나씩 검토하고 등록합니다.</p><div className="row mt16"><button type="button" className="btn primary" disabled={busy} onClick={()=>void run()}>{busy?'초안 만드는 중…':'미답변 전체 초안 만들기'}</button>{busy&&<button type="button" className="btn" disabled={stopping} onClick={()=>{stop.current=true;setStopping(true);}}>{stopping?'진행 중인 요청을 마치고 중지합니다…':'초안 만들기 중지'}</button>}</div><p className="meta">이미 준비한 초안과 수정한 내용은 다시 만들지 않습니다. 실패하거나 아직 준비하지 않은 질문은 다시 시도할 수 있습니다.</p>
   {notice&&<p role="status" className="notice">{notice}</p>}
   <div className="stack mt16">{entries.map(e=><article className="panel pad" key={e.id}><h3>{e.title}</h3>{e.learning_context&&<p className="meta">{e.learning_context}</p>}<details><summary>질문 내용</summary><p className="reading-copy">{e.content}</p></details><QuestionAiReferenceNote reference={e.reference}/>
    {e.state==='working'||e.state==='queued'?<p>{e.state==='working'?'초안을 만들고 있습니다.':'생성 대기 중입니다.'}</p>:e.state==='saved'?<p>답변을 등록했습니다.</p>:<>{e.error&&<p role="alert">{e.error}</p>}{Boolean(e.draft)&&<label className="field">답변 초안<textarea rows={5} maxLength={10000} value={e.draft} onChange={event=>patch(e.id,{draft:event.target.value})}/></label>}<button type="button" className="btn mt16" disabled={!e.draft && e.state!=='skipped'} onClick={()=>setSelected(e.id)}>{e.draft?'초안 검토하고 등록':'최신 질문 확인'}</button></>}
   </article>)}</div>
  </div>}
  {active&&<QuestionThreadDialog key={active.id} questionId={active.id} initialDraft={active.draft} initialReference={active.reference} changed={changed} onDraftChange={draft=>patch(active.id,{draft})} onDraftUsed={()=>patch(active.id,{draft:'',state:'saved',error:undefined})} close={()=>setSelected(null)}/>}
 </section>;
}
