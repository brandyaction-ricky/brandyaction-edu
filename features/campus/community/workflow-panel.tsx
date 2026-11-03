'use client';
import { useEffect,useRef,useState } from 'react';
import type { CommunityPost } from './domain';
import { demoPeerId } from './demo';
import { emptyFlowState,exchangeLabels,slotLabels,mutateFlowDemo,validateFlowCommand,type FlowCommand,type FlowState,type Exchange } from './workflows';
import styles from './panel.module.css';
import { useCampusDraftGuard } from '../ui/draft-guard';
const demoFlows=new Map<string,FlowState>();
export function CommunityWorkflowPanel({post,viewerId,demo}:{post:CommunityPost;viewerId:string;demo:boolean}){
 const key=viewerId+post.id;const [state,setState]=useState<FlowState>(()=>demo?demoFlows.get(key)??emptyFlowState():emptyFlowState());
 const [note,setNote]=useState(''),[alias,setAlias]=useState('문샷 동료'),[start,setStart]=useState(''),[minutes,setMinutes]=useState(10),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(demo);
 const [pending,setPending]=useState<FlowCommand|null>(null);const receipts=useRef(new Map<string,string>()),alive=useRef(true);
 useCampusDraftGuard(!!note.trim()||!!start,busy);
 async function refresh(){try{const r=await fetch('/api/campus/community/workflows?postId='+post.id,{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error);if(alive.current){setState(data);setLoaded(true);}}catch(e){if(alive.current)setError((e as Error).message);}}
 useEffect(()=>{alive.current=true;if(!demo)void Promise.resolve().then(()=>{if(alive.current)void refresh();});return()=>{alive.current=false;};},[post.id,demo]); // eslint-disable-line react-hooks/exhaustive-deps
 async function send(values:Partial<FlowCommand>,actor=viewerId,operator=false){if(busy)return;setBusy(true);setError('');try{
  const c=validateFlowCommand({requestId:crypto.randomUUID(),postId:post.id,note,alias,...values});setPending(c);
  if(demo){const hash=JSON.stringify(c);if(receipts.current.has(c.requestId)&&receipts.current.get(c.requestId)!==hash)throw Error('중복 요청이 달라졌어요.');const next=receipts.current.has(c.requestId)?state:mutateFlowDemo(state,c,post,actor,operator);receipts.current.set(c.requestId,hash);demoFlows.set(key,next);setState(next);}else{const r=await fetch('/api/campus/community/workflows',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});const data=await r.json();if(!r.ok)throw Error(data.error);await refresh();}
  setPending(null);setNote('');if(c.action==='demo_reserve')setStart('');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const isTalent=post.kind.startsWith('talent_'),own=post.owner_id===viewerId,slots=state.slots.filter(s=>s.post_id===post.id);
 function action(x:Exchange,act:FlowCommand['action'],label:string,actor=viewerId){return <button type="button" className={styles.secondary} disabled={busy} onClick={()=>void send({action:act,entityId:x.id,expectedRevision:x.revision},actor)}>{label}</button>;}
 if(post.visibility!=='cohort')return <p className={styles.privateNote}>같은 기수에 공유한 후 {isTalent?'재능 교환을 연결':'발표 시간을 예약'}할 수 있어요.</p>;
 return <section className={styles.flow} aria-label={isTalent?'재능 교환 진행':'데모데이 진행'}>
  <div className={styles.sectionHeader}><h4>{isTalent?'함께할 일을 합의해요':'발표 순서와 질문을 한곳에'}</h4>{!demo&&<button className={styles.textButton} onClick={()=>void refresh()} disabled={busy}>진행 새로고침</button>}</div>
  <p className={styles.hint}>{isTalent?'제안 → 상대 수락 → 작업 내용 제출 → 상대 완료 확인. 교환 완료 자체로 XP가 지급되지는 않아요.':'발표자는 시간을 예약하고, 운영자가 시작과 종료를 기록해요. 스트리밍이나 외부 알림을 자동 실행하지 않습니다.'}</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{!loaded&&<p>진행 기록을 확인하고 있어요.</p>}
  {pending&&error&&<button className={styles.textButton} disabled={busy} onClick={()=>void send(pending!)}>같은 요청 다시 확인</button>}
  <label className={styles.flowField}>{isTalent?'제안·작업 결과·처리 이유':'질문·답변·진행 메모'}<textarea maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder={isTalent?'도울 일과 범위, 완료 기준 또는 처리 이유를 구체적으로 적어 주세요.':'발표자에게 궁금한 점 또는 답변·진행 이유를 적어 주세요.'}/></label>
  <label className={styles.flowField}>표시할 별명<input value={alias} maxLength={24} onChange={e=>setAlias(e.target.value)}/></label>
  {isTalent?<>
   {!own&&<button type="button" className={styles.primary} disabled={busy||state.exchanges.some(x=>x.proposer_id===viewerId&&['proposed','accepted','submitted'].includes(x.status))} onClick={()=>void send({action:'exchange_propose'})}>함께할 일 제안하기</button>}
   {demo&&own&&!state.exchanges.length&&<button className={styles.demoAction} disabled={busy} onClick={()=>void send({action:'exchange_propose',note:'예시 동료가 첫 화면 문구 검토를 돕고 디자인 의견을 받고 싶습니다.',alias:'예시 동료'},demoPeerId)}>체험: 동료의 교환 제안 받기</button>}
   {state.exchanges.map(x=><article className={styles.flowCard} key={x.id}><strong>{exchangeLabels[x.status]} · {x.alias}</strong><p>{x.proposal}</p>{x.result_note&&<p><b>제출한 결과</b><br/>{x.result_note}</p>}<div className={styles.flowActions}>
    {x.recipient_id===viewerId&&x.status==='proposed'&&<>{action(x,'exchange_accept','제안 수락')}{action(x,'exchange_decline','이유를 남기고 거절')}</>}
    {x.proposer_id===viewerId&&x.status==='proposed'&&action(x,'exchange_cancel','내 제안 취소')}
    {x.proposer_id===viewerId&&x.status==='accepted'&&action(x,'exchange_submit','작업 완료 내용 제출')}
    {x.recipient_id===viewerId&&x.status==='submitted'&&action(x,'exchange_complete','결과 확인하고 완료')}
    {demo&&x.recipient_id===viewerId&&x.status==='accepted'&&action(x,'exchange_submit','체험: 동료가 완료 내용 제출',x.proposer_id)}
    {demo&&x.proposer_id===viewerId&&x.status==='proposed'&&action(x,'exchange_accept','체험: 동료가 제안 수락',x.recipient_id)}
    {demo&&x.proposer_id===viewerId&&x.status==='submitted'&&action(x,'exchange_complete','체험: 동료가 완료 확인',x.recipient_id)}
   </div></article>)}
  </>:<>
   {own&&!slots.some(s=>['scheduled','presenting'].includes(s.status))&&<form className={styles.scheduleForm} onSubmit={e=>{e.preventDefault();void send({action:'demo_reserve',startsAt:new Date(start).toISOString(),minutes});}}><label>발표 시작 시간<input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>발표 길이<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[5,10,15,20,30].map(n=><option value={n} key={n}>{n}분</option>)}</select></label><button className={styles.primary} disabled={busy}>발표 슬롯 예약</button></form>}
   {!!state.slots.length&&<details><summary>기수 발표 시간표 · {state.slots.filter(s=>s.status!=='canceled').length}개</summary><ol>{state.slots.filter(s=>s.status!=='canceled').map(s=><li key={s.id}>{new Date(s.starts_at).toLocaleString('ko-KR')} · {s.minutes}분 · {s.post_id===post.id?'이 결과물':'다른 동료 발표'} · {slotLabels[s.status]}</li>)}</ol></details>}
   {slots.map(s=><article className={styles.flowCard} key={s.id}><strong>{slotLabels[s.status]}</strong><p>{new Date(s.starts_at).toLocaleString('ko-KR')} · {s.minutes}분</p><div className={styles.flowActions}>
    {own&&s.status==='scheduled'&&<button className={styles.secondary} disabled={busy} onClick={()=>void send({action:'demo_cancel',entityId:s.id,expectedRevision:s.revision})}>예약 취소</button>}
    {(state.operator||demo)&&s.status==='scheduled'&&<button className={demo?styles.demoAction:styles.primary} disabled={busy} onClick={()=>void send({action:'demo_start',entityId:s.id,expectedRevision:s.revision},viewerId,demo)}>{demo?'체험: 진행자가 발표 시작':'발표 시작'}</button>}
    {(state.operator||demo)&&s.status==='presenting'&&<button className={demo?styles.demoAction:styles.primary} disabled={busy} onClick={()=>void send({action:'demo_finish',entityId:s.id,expectedRevision:s.revision},viewerId,demo)}>{demo?'체험: 진행자가 발표 종료':'발표 종료'}</button>}
    {(!state.operator||own||demo)&&['scheduled','presenting'].includes(s.status)&&<button className={styles.secondary} disabled={busy} onClick={()=>void send({action:'demo_ask',entityId:s.id})}>발표에 질문 남기기</button>}
   </div>{state.questions.filter(q=>q.slot_id===s.id).map(q=><div className={styles.demoQuestion} key={q.id}><strong>{q.alias} · {q.answer?'답변 완료':'답변 대기'}</strong><p>{q.body}</p>{q.answer&&<blockquote>{q.answer}</blockquote>}{own&&<button className={styles.textButton} disabled={busy} onClick={()=>void send({action:'demo_answer',entityId:s.id,questionId:q.id,expectedRevision:q.revision})}>{q.answer?'답변 수정':'위 메모로 답변하기'}</button>}</div>)}</article>)}
  </>}
  {!!state.history.length&&<details><summary>변경 이력 · {state.history.length}건</summary><ol>{state.history.map(h=><li key={h.id}><strong>{exchangeLabels[h.status as keyof typeof exchangeLabels]??slotLabels[h.status as keyof typeof slotLabels]}</strong> · {h.note||'발표 시간 예약'}<small> · {new Date(h.created_at).toLocaleString('ko-KR')}</small></li>)}</ol></details>}
 </section>;
}
