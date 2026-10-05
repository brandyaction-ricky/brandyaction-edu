'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Compass, RefreshCw } from 'lucide-react';
import { AdminButton, AdminEmptyState, AdminInlineError, AdminInput, AdminLinkButton, AdminModal, AdminPage, AdminPageHeader, AdminStatusBadge, AdminSummaryCard } from '@/features/admin-ui';
import type { DiagnosisAdminList, DiagnosisAdminRow } from '@/lib/diagnosis-admin-service';
import './diagnosis-management.css';

type Change={title:string;description:string;body:Record<string,unknown>;label:string};
const date=(v:string|null|undefined)=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const reportLabels:Record<string,string>={not_submitted:'검사 진행 중',queued:'발급 대기',processing:'보고서 작성 중',ready:'발급 완료',needs_review:'확인 필요',access_denied:'이용 권한 확인 필요'};
const errorLabels:Record<string,string>={JOB_DEADLINE_REACHED:'처리 시간이 초과되었습니다.',PROVIDER_RECONCILIATION_REQUIRED:'AI 요청의 처리·비용 확인이 필요합니다.',ANSWERS_REQUIRE_REVIEW:'제출한 답변의 확인이 필요합니다.',ISSUED_ARTIFACT_REQUIRES_REVIEW:'발급 파일의 확인이 필요합니다.',ADMIN_RETRY_REQUESTED:'관리자가 저장된 답변으로 재발급을 요청했습니다.',PROVIDER_RATE_LIMIT:'AI 공급자 처리 한도에 도달했습니다.'};
export function DiagnosisManagement(){
  const [data,setData]=useState<DiagnosisAdminList|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[cursors,setCursors]=useState<(string|null)[]>([null]);
  const [change,setChange]=useState<Change|null>(null),[saving,setSaving]=useState(false),[writeError,setWriteError]=useState('');
  const sequence=useRef(0),busy=useRef(false),controller=useRef<AbortController|null>(null);
  const before=cursors.at(-1)??null;
  const load=useCallback(async()=>{
    const version=++sequence.current;controller.current?.abort();const c=new AbortController();controller.current=c;setLoading(true);
    try{
      const qs=new URLSearchParams({query});if(before)qs.set('before',before);
      const response=await fetch('/api/admin/diagnosis?'+qs,{cache:'no-store',signal:AbortSignal.any([c.signal,AbortSignal.timeout(25_000)])});const result=await response.json();
      if(!response.ok)throw Error(result.error||'진단 정보를 확인하지 못했습니다.');
      if(version!==sequence.current)return;setData(result);setError('');
    }catch(e){if(!c.signal.aborted&&version===sequence.current)setError(e instanceof Error?e.message:'진단 정보를 확인하지 못했습니다.');}
    finally{if(version===sequence.current)setLoading(false);}
  },[query,before]);
  useEffect(()=>{let mounted=true;const requests=sequence,activeController=controller;queueMicrotask(()=>{if(mounted)void load();});return()=>{mounted=false;++requests.current;activeController.current?.abort();};},[load]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!busy.current&&!change)void load();},30_000);return()=>clearInterval(timer);},[load,change]);
  const ask=(next:Change)=>{setNotice('');setWriteError('');setChange(next);};
  async function save(){
    if(!change||busy.current)return;busy.current=true;setSaving(true);setWriteError('');
    try{
      const response=await fetch('/api/admin/diagnosis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(change.body),signal:AbortSignal.timeout(25_000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'요청을 확인하지 못했습니다.');
      setNotice(change.body.action==='retry'?'저장된 답변으로 재발급을 요청했습니다. 발급 상태를 자동으로 확인합니다.':'진단 공개 설정을 저장했습니다.');setChange(null);void load();
    }catch(e){setWriteError(e instanceof Error?e.message:'요청 결과를 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.');}
    finally{busy.current=false;setSaving(false);}
  }
  const publication=(enabled:boolean,row?:DiagnosisAdminRow)=>ask({title:row?`${row.name}님 진단 ${enabled?'공개':'닫기'}`:`전체 진단 ${enabled?'공개':'닫기'}`,
    description:row?`${row.name}님에게 진단 시작 메뉴를 ${enabled?'공개합니다.':'닫습니다. 이미 시작한 검사는 이어서 진행할 수 있습니다.'}`:`현재 이용 가능한 수강생 ${data?.eligibleCount??0}명에게 적용합니다. 개별 설정도 모두 ${enabled?'공개':'닫기'}로 바뀌고, 이후 등록되는 수강생도 이 설정을 따릅니다.${enabled?'':' 이미 시작한 검사는 이어서 진행할 수 있습니다.'}`,
    label:enabled?'공개하기':'닫기',body:{action:row?'publish_member':'publish_all',requestId:crypto.randomUUID(),...(row?{userId:row.id}:{}),enabled,revision:data?.revision}});
  return <AdminPage width="wide" className="diagnosis-management">
    <AdminPageHeader title="N6 진단 관리" description="수강생에게 진단을 공개하고, 검사와 보고서 진행 상태를 확인하세요." actions={<AdminLinkButton href="/admin/diagnosis"><Compass size={17}/>N6 진단 받기<ArrowRight size={16}/></AdminLinkButton>}/>
    <div className="diagnosis-management-summary">
      <AdminSummaryCard label="진단 이용 가능한 수강생" value={`${data?.eligibleCount??'—'}명`} scope="검사가 연결된 상품의 현재 구매·수강 권한 기준"/>
      <AdminSummaryCard label="검사를 시작한 수강생" value={`${data?.startedCount??'—'}명`} scope="관리자 테스트 제외 · 전체 수강생 기준"/>
    </div>
    <section className="diagnosis-management-publication" aria-label="전체 진단 공개 설정">
      <div><h2>수강생 진단 공개</h2><p>전체 공개와 수강생별 공개를 선택할 수 있습니다.</p><small>공개를 닫아도 이미 시작한 검사는 이어서 진행됩니다.</small></div>
      <div className="diagnosis-management-actions"><AdminStatusBadge status="active" label={data?.allPublished?'기본 설정: 공개':'기본 설정: 비공개'} tone={data?.allPublished?'success':'neutral'}/>
        <AdminButton tone="primary" disabled={!data||!data.enabled||!!error||loading||saving} onClick={()=>publication(true)}>한 번에 모두 공개</AdminButton>
        <AdminButton disabled={!data||!data.enabled||!!error||loading||saving} onClick={()=>publication(false)}>한 번에 모두 닫기</AdminButton></div>
    </section>
    <form className="diagnosis-management-toolbar" onSubmit={e=>{e.preventDefault();setCursors([null]);setQuery(search.trim());}}>
      <AdminInput label="수강생 이름" value={search} maxLength={100} onChange={e=>setSearch(e.target.value)} placeholder="이름으로 검색"/>
      <AdminButton type="submit" disabled={saving}>검색</AdminButton><AdminButton onClick={()=>void load()} loading={loading} disabled={saving}><RefreshCw size={16}/>새로고침</AdminButton>
      <span>한국 시간(KST) · 페이지당 최대 100명 · 30초마다 자동 확인</span>
    </form>
    {error&&<AdminInlineError onRetry={()=>void load()}>{error} 현재 상태를 다시 확인한 후 변경해 주세요.</AdminInlineError>}
    {notice&&<p className="diagnosis-management-notice" role="status">{notice}</p>}
    {data&&!data.remoteAvailable&&<p className="diagnosis-management-warning" role="status">보고서 서버의 최신 상태를 확인하지 못했습니다. 아래는 마지막 확인 기록이며 재발급은 잠시 사용할 수 없습니다.</p>}
    {!data&&loading&&<p role="status">진단 정보를 불러오고 있습니다.</p>}
    {data&&<div className="diagnosis-management-table" role="region" aria-label="수강생 진단 현황" tabIndex={0}>
      <table><thead><tr><th>수강생</th><th>공개 설정</th><th>검사 진행</th><th>보고서 발급</th><th>기록·재발급</th></tr></thead>
        <tbody>{data.rows.map(row=>{const r=row.report;return <tr key={row.id}>
          <th scope="row">{row.name}</th>
          <td data-label="공개 설정"><AdminButton size="sm" disabled={loading||saving||!!error||!data.enabled} onClick={()=>publication(!row.published,row)} aria-label={`${row.name} 진단 ${row.published?'닫기':'공개'}`}>{row.published?'공개 중 · 닫기':'비공개 · 공개'}</AdminButton></td>
          <td data-label="검사 진행"><span>{!row.attemptId?'시작 전':row.state==='in_progress'?'검사 중':row.state==='preparing'?'검사 연결 중':'제출 완료'}</span>{row.attemptId&&<><small>검사 시작 {date(r?.startedAt??row.startedAt)}</small><small>제출 완료 {r?.submittedAt?date(r.submittedAt):row.state==='submitted'?'시각 확인 필요':'—'}</small></>}</td>
          <td data-label="보고서 발급"><AdminStatusBadge status="active" label={!row.attemptId?'검사 시작 전':!r?'상태 확인 대기':reportLabels[r.state]??'확인 필요'} tone={r?.state==='ready'?'success':r?.state==='needs_review'?'warning':'neutral'}/>{r?.state==='ready'&&<small>보고서 발급 {r.issuedAt?date(r.issuedAt):'시각 확인 필요'}</small>}</td>
          <td data-label="기록·재발급"><details><summary>진행·오류 기록 보기</summary><div className="diagnosis-management-history">
            <p>상태 조회: {date(r?.checkedAt)} (발급 시각과 다릅니다)</p><p>검사 정보 갱신: {date(row.updatedAt)}</p><p>보고서 상태 갱신: {date(r?.updatedAt)}</p>
            {r?.errorCode&&<p className="diagnosis-management-warning">{errorLabels[r.errorCode]??'보고서 처리 중 확인이 필요한 오류가 기록되었습니다.'}<code>{r.errorCode}</code></p>}
            {r?.details?.length?<ul>{r.details.map((d,i)=><li key={`${d.at}-${i}`}><time>{date(d.at)}</time> {errorLabels[d.code]??'보고서 처리 기록'}<code>{d.code}</code></li>)}</ul>:<p>기록된 오류가 없습니다.</p>}
            {r?.errorCode&&!r.canRetry&&<p>이미 처리 중이거나 답변·발급 파일·AI 요청 비용의 확인이 필요하면 자동 재발급을 막습니다.</p>}
          </div></details>
            <AdminButton size="sm" disabled={!r?.canRetry||!row.statusAvailable||!!error||saving||loading} onClick={()=>ask({title:`${row.name}님 보고서 재발급`,description:'제출한 답변으로 보고서 발급을 다시 진행합니다. 수강생이 검사를 다시 할 필요는 없습니다. 이어서 처리하는 과정에서 AI 사용 비용이 발생할 수 있습니다.',label:'저장된 답변으로 재발급',body:{action:'retry',requestId:crypto.randomUUID(),attemptId:row.attemptId,expectedVersion:r?.version}})}>보고서 재발급</AdminButton>
          </td></tr>;})}</tbody></table>
      {!data.rows.length&&<AdminEmptyState title="해당 수강생이 없습니다.">검사가 연결된 상품의 구매·수강 권한과 검색어를 확인해 주세요.</AdminEmptyState>}
    </div>}
    <nav className="diagnosis-management-pages" aria-label="수강생 목록 페이지"><AdminButton disabled={cursors.length===1||loading||saving} onClick={()=>setCursors(c=>c.slice(0,-1))}>이전</AdminButton><span>{cursors.length}페이지</span><AdminButton disabled={!data?.nextCursor||loading||saving} onClick={()=>setCursors(c=>[...c,data!.nextCursor])}>다음</AdminButton></nav>
    <p className="diagnosis-management-footnote">보고서는 보통 약 30분~1일 안에 준비됩니다. 동일한 검사의 재발급 요청은 중복 접수되지 않습니다.</p>
    {change&&<AdminModal title={change.title} onClose={()=>{if(!busy.current)setChange(null);}}><div className="admin-dialog-body"><p>{change.description}</p>{writeError&&<AdminInlineError>{writeError}</AdminInlineError>}</div><footer className="admin-dialog-footer"><AdminButton disabled={saving} onClick={()=>setChange(null)}>취소</AdminButton><AdminButton tone="primary" loading={saving} onClick={()=>void save()}>{change.label}</AdminButton></footer></AdminModal>}
    <Link href="/admin" className="diagnosis-management-back">관리자 홈으로</Link>
  </AdminPage>;
}
