'use client';
import { useEffect, useState } from 'react';
import type { OfficeJob } from './domain';
import type { DispatchCommand, DispatchRecord } from './dispatch-handler';
import styles from './panel.module.css';
import {useCampusDraftGuard} from '../ui/draft-guard';
const labels:Record<DispatchRecord['status'],string>={queued:'전송 대기',leased:'전달 확인 중',accepted:'외부 접수 확인',uncertain:'처리 여부 확인 필요',rejected:'미접수 확인',cancelled:'취소 확인'};
export function OfficeDispatchPanel({job,demo,onChanged,onLockChange}:{job:OfficeJob;demo:boolean;onChanged:()=>Promise<void>;onLockChange:(locked:boolean)=>void}){
 return <DispatchSession key={`${job.id}:${job.revision}:${demo}`} job={job} demo={demo} onChanged={onChanged} onLockChange={onLockChange}/>;
}
function DispatchSession({job,demo,onChanged,onLockChange}:{job:OfficeJob;demo:boolean;onChanged:()=>Promise<void>;onLockChange:(locked:boolean)=>void}){
 const [record,setRecord]=useState<DispatchRecord|null>(null),[ready,setReady]=useState(false),[loaded,setLoaded]=useState(false),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pending,setPending]=useState<DispatchCommand|null>(null);
 useCampusDraftGuard(false,busy);
 const unresolved=!!record&&(['queued','leased','uncertain'].includes(record.status)||record.status==='accepted'&&['awaiting_connection','queued','running','revision_requested'].includes(job.status));
 useEffect(()=>{onLockChange(unresolved);return()=>onLockChange(false);},[unresolved,onLockChange]);
 useEffect(()=>{if(demo)return;let live=true;const controller=new AbortController();fetch(`/api/campus/office/dispatch?enrollmentId=${job.enrollment_id}`,{cache:'no-store',signal:controller.signal}).then(async r=>{if(r.status===404){if(live)setLoaded(true);return;}const data=await r.json();if(!r.ok)throw Error('전달 내역을 확인하지 못했습니다.');if(live){setRecord(data.dispatches.find((d:DispatchRecord)=>d.jobId===job.id)??null);setReady(data.connected);setLoaded(true);}}).catch(e=>{if(live&&!controller.signal.aborted)setError(e instanceof Error?e.message:'확인 실패');});return()=>{live=false;controller.abort();};},[demo,job.id,job.enrollment_id]);
 async function send(action:DispatchCommand['action'],existing?:DispatchCommand){if(busy)return;const c=existing??{requestId:crypto.randomUUID(),enrollmentId:job.enrollment_id,jobId:job.id,expectedJobRevision:job.revision,action,dispatchId:record?.id,expectedRevision:record?.revision};setPending(c);setBusy(true);setError('');try{const r=await fetch('/api/campus/office/dispatch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(c)});const data=await r.json();if(!r.ok)throw Error(data.error);setRecord(data);setPending(null);await onChanged();}catch(e){setError(e instanceof Error?e.message:'전달 상태를 확인해 주세요.');}finally{setBusy(false);}}
 if(demo||loaded&&!ready&&!record)return <aside className={styles.waiting}>외부 작업 전송 어댑터는 기본 꺼짐입니다. 실제 오피스 워커의 연결·중복 방지·취소 계약을 검수한 뒤 사용할 수 있어요.</aside>;
 return <section className={styles.review} aria-label="외부 오피스 전달"><h4>오피스에 작업 전달</h4><p className={styles.hint}>전달 시 이 작업의 목표·참고 URL·결과물 유형·수정 메모와 계정 연결용 식별자만 등록된 오피스로 보냅니다. 실제 실행과 초안 도착은 별도 이벤트로 확인하며, 최종 승인은 직접 합니다.</p>{!loaded&&!error&&<p>전달 상태 확인 중…</p>}{record&&<><p role="status"><strong>{labels[record.status]}</strong>{record.cancelRequested&&record.status!=='cancelled'?' · 취소 확인 대기':''}</p>{record.status==='uncertain'&&<p>응답이 불분명해 자동 재전송을 멈췄어요. 먼저 외부 처리 여부를 확인합니다.</p>}{record.status==='cancelled'&&<p>외부 취소 또는 전송 전 취소를 확인했어요. 이미 사용한 외부 실행 비용은 회수되지 않을 수 있어요.</p>}</>}{error&&<p role="alert" className={styles.error}>{error}</p>}
 <div className={styles.actions}>{pending?<button className={styles.secondary} type="button" disabled={busy} onClick={()=>void send(pending.action,pending)}>같은 요청 다시 확인</button>:<>
 {ready&&['awaiting_connection','revision_requested'].includes(job.status)&&(!record||record.jobRevision!==job.revision&&!['queued','leased','uncertain'].includes(record.status))&&<><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>선택한 작업 자료를 등록된 오피스에 전달합니다.</label><button className={styles.primary} type="button" disabled={busy||!consent} onClick={()=>void send('enqueue')}>작업 전달 요청</button></>}
 {record?.status==='uncertain'&&<button className={styles.secondary} type="button" disabled={busy||!ready||record.attempts>=12} onClick={()=>void send('reconcile')}>외부 처리 여부 확인</button>}
 {record?.status==='rejected'&&!record.cancelRequested&&record.jobRevision===job.revision&&<button className={styles.secondary} type="button" disabled={busy||!ready||record.attempts>=12} onClick={()=>void send('retry')}>미접수 작업 다시 전달</button>}
 {record&&!['cancelled','rejected'].includes(record.status)&&!record.cancelRequested&&!['review','approved','archived'].includes(job.status)&&<button className={styles.secondary} type="button" disabled={busy||!ready} onClick={()=>void send('cancel')}>전달·실행 취소 요청</button>}
 </>}</div></section>;
}
