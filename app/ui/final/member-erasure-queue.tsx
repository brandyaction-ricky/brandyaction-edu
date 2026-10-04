'use client';
import {useCallback,useEffect,useState} from 'react';
import {CheckCircle2,Clock3,RefreshCw,ShieldAlert} from 'lucide-react';
import './member-erasure-queue.css';
type RequestRow={requestId:string;memberId:string;state:string;receivedAt:string;deadlineAt:string;nextAttemptAt:string;attempts:number;uncertainAttempts:number;counts:Record<string,number>;storageRemoved:number;storageFailedCount:number;lastCode:string|null;completedAt:string|null};
const labels:Record<string,string>={requested:'접수',processing:'삭제 중',retry:'다시 시도 예정',blocked:'관리자 확인 필요',complete:'삭제 완료'};
const errors:Record<string,string>={NETWORK:'서버 연결이 끊겼습니다.',UNAVAILABLE:'마이인 서버가 처리 중입니다.',STORAGE_PENDING:'남은 파일을 다시 지울 예정입니다.',CONFIGURATION:'서버 연결 설정을 확인해 주세요.',UNAUTHORIZED:'서버 인증 설정을 확인해 주세요.',FORBIDDEN:'서버 환경을 확인해 주세요.',DISABLED:'마이인 삭제 기능이 아직 켜지지 않았습니다.',LOCAL_WITHDRAWAL_BLOCKED:'에듀 탈퇴 권한·상태를 확인해 주세요.',INVALID_RESPONSE:'삭제 결과 형식을 확인해 주세요.'};
export function MemberErasureQueue() {
  const [rows,setRows]=useState<RequestRow[]>([]),[enabled,setEnabled]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(true);
  const refresh=useCallback(async()=>{setBusy(true);try{const res=await fetch('/api/admin/member-erasure',{cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error);if(!Array.isArray(data.rows))throw Error('기록을 불러오지 못했습니다. 다시 시도해 주세요.');setRows(data.rows);setEnabled(data.enabled===true);setError('');}catch(e){setError(e instanceof Error?e.message:'기록을 불러오지 못했습니다.');}finally{setBusy(false);}},[]);
  useEffect(()=>{const controller=new AbortController();
    async function initialLoad(){try{const res=await fetch('/api/admin/member-erasure',{cache:'no-store',signal:controller.signal});const data=await res.json();if(!res.ok)throw Error(data.error);if(!Array.isArray(data.rows))throw Error('기록을 불러오지 못했습니다. 다시 시도해 주세요.');if(!controller.signal.aborted){setRows(data.rows);setEnabled(data.enabled===true);}}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'기록을 불러오지 못했습니다.');}finally{if(!controller.signal.aborted)setBusy(false);}}
    void initialLoad();return()=>controller.abort();
  },[]);
  async function retry(requestId:string){setBusy(true);try{const res=await fetch('/api/admin/member-erasure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId})});const data=await res.json();if(!res.ok)throw Error(data.error);await refresh();}catch(e){setError(e instanceof Error?e.message:'재시도하지 못했습니다.');}finally{setBusy(false);}}
  const pending=rows.filter(r=>r.state!=='complete').length;
  return <section className="panel erasure-queue" aria-label="탈퇴 요청·진단 삭제 기록" aria-busy={busy}>
    <header className="erasure-heading">
      <div><h2>탈퇴 요청·진단 삭제 기록</h2><p>접수한 요청의 처리 상태를 확인하세요.</p></div>
      <button className="btn small" type="button" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/>처리 상태 새로고침</button>
    </header>
    <div className="erasure-overview">
      {!busy&&!error&&rows.length>0&&<><span><strong>{pending}</strong>건 처리 대기</span><span><strong>{rows.length-pending}</strong>건 삭제 완료</span></>}
      <details className="erasure-help"><summary>처리 안내</summary><p>{enabled?'마이인 진단 데이터와 파일 삭제가 모두 끝나야 완료됩니다.':'지금은 요청만 접수합니다. 삭제 연동 검수를 마친 뒤 처리합니다.'} 접수일부터 30일 안에 처리 상태를 확인해 주세요.</p></details>
    </div>
    {!enabled&&<p className="erasure-note"><Clock3 size={16} aria-hidden="true"/>지금은 요청만 접수합니다.</p>}
    {error&&<p className="erasure-warning" role="alert">{error}</p>}
    {busy&&<p className="erasure-empty" role="status">처리 상태를 확인하고 있습니다.</p>}
    {!busy&&!rows.length&&!error&&<p className="erasure-empty">접수된 탈퇴 요청이 없습니다.</p>}
    <ul className="erasure-list">{rows.map(r=><li className="erasure-card" key={r.requestId}>
      <div className="erasure-card-heading">
        <span className={`erasure-status erasure-status--${r.state==='complete'?'complete':r.state==='blocked'?'blocked':'pending'}`}>
          {r.state==='complete'?<CheckCircle2 size={16} aria-hidden="true"/>:r.state==='blocked'?<ShieldAlert size={16} aria-hidden="true"/>:<Clock3 size={16} aria-hidden="true"/>}
          {labels[r.state]??'상태 확인 필요'}
        </span>
        <a className="btn small ghost" href={`/admin/customers?member=${encodeURIComponent(r.memberId)}`}>해당 회원 확인</a>
      </div>
      <div className="erasure-results" aria-label="확인된 삭제 결과">
        <span>진단 기록 <strong>{Object.values(r.counts).reduce((a,b)=>a+b,0)}건</strong></span>
        <span>파일 <strong>{r.storageRemoved}개</strong></span>
        {r.storageFailedCount>0&&<span className="erasure-remaining">남은 파일 <strong>{r.storageFailedCount}개</strong></span>}
      </div>
      {r.uncertainAttempts>0&&<p className="erasure-note"><ShieldAlert size={16} aria-hidden="true"/>응답을 받지 못한 시도가 있어 실제 삭제 건수는 더 많을 수 있습니다.</p>}
      {r.lastCode&&<p className="erasure-warning">{errors[r.lastCode]??'서버 응답을 확인해야 합니다.'}</p>}
      <div className="erasure-card-footer">
        <details className="erasure-details"><summary>요청 상세 보기</summary><dl>
          <div><dt>요청번호</dt><dd>{r.requestId}</dd></div>
          <div><dt>접수</dt><dd>{new Date(r.receivedAt).toLocaleString('ko-KR')}</dd></div>
          <div><dt>처리 기한</dt><dd>{new Date(r.deadlineAt).toLocaleDateString('ko-KR')}</dd></div>
          {r.completedAt&&<div><dt>완료</dt><dd>{new Date(r.completedAt).toLocaleString('ko-KR')}</dd></div>}
          {r.state==='retry'&&<div><dt>다음 시도</dt><dd>{new Date(r.nextAttemptAt).toLocaleString('ko-KR')}</dd></div>}
        </dl><p>표시한 수는 삭제 결과로 확인된 건수입니다.</p></details>
        {enabled&&['retry','blocked'].includes(r.state)&&<button className="btn small" type="button" disabled={busy} onClick={()=>void retry(r.requestId)}>같은 요청으로 다시 시도</button>}
      </div>
    </li>)}</ul>
  </section>;
}
