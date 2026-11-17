'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './agents/panel.module.css';
import { createClient } from '@/lib/supabase/client';

type Employee = { employeeId: string; name: string; telegramUrl: string | null };
export type Connection = { id: string; employeeId: string; status: 'pending'|'active'|'expired'; confirmation: string | null };
export const connectionLabel = (status: Connection['status']) => status==='active'?'보고 연결됨':status==='expired'?'확인 기간 만료':'확인 대기';

/** One reader of the learner's report connections, shared by the employee cards and the setup steps. */
export function useStudentConnections(enrollmentId: string, enabled: boolean) {
  const [rows,setRows]=useState<Connection[]|null>(null);
  const [message,setMessage]=useState(''), [busy,setBusy]=useState(false);
  const locked=useRef(false);
  const rpc=useCallback(async (action:string, employeeId:string|null=null, pairing:string|null=null, id:string|null=null)=>{
    const {data,error}=await createClient().rpc('edu_campus_student_connection',{
      p_enrollment:enrollmentId,p_action:action,p_employee:employeeId,p_code:pairing,p_id:id,
    });
    if(error)throw Error(error.code==='42501'?'이 수강권과 직원의 연결 권한을 확인해 주세요.':error.code==='23514'?'코드가 만료되었거나 형식이 다릅니다. 직원에게 새 코드를 요청하세요.':error.code==='23505'||error.code==='40001'?'이미 사용한 코드이거나 기존 연결이 있어요. 연결 상태를 확인하세요.':'연결 상태를 확인하지 못했어요. 다시 시도해 주세요.');
    return data as Connection[];
  },[enrollmentId]);
  useEffect(()=>{if(!enabled)return;let current=true;
    const load=()=>rpc('list').then(data=>{if(current)setRows(data);}).catch(e=>{if(current)setMessage(e.message);});
    void load();window.addEventListener('focus',load);
    return ()=>{current=false;window.removeEventListener('focus',load);};
  },[rpc,enabled]);
  const run=useCallback(async (action:'list'|'pair'|'revoke',employeeId:string|null=null,code:string|null=null,id:string|null=null)=>{
    if(locked.current)return false;locked.current=true;setBusy(true);setMessage('');
    try{
      if(action!=='list')await rpc(action,employeeId,code,id);
      setRows(await rpc('list'));
      if(action==='pair')setMessage('코드를 확인했어요. 직원 카드에 나온 확인 명령을 같은 텔레그램 대화에 보내면 연결이 끝나요.');
      return true;
    }catch(e){setMessage((e as Error).message);return false;}finally{locked.current=false;setBusy(false);}
  },[rpc]);
  return {enabled,rows:enabled?rows:null,busy,message,
    refresh:()=>run('list'),pair:(employeeId:string,code:string)=>run('pair',employeeId,code),revoke:(id:string)=>run('revoke',null,null,id)};
}
export type StudentConnectionState = ReturnType<typeof useStudentConnections>;

/** How to connect, and the one form that needs typing. Each employee's status lives on its own card. */
export function ConnectionSetup({enrollmentId,employees,conn}:{enrollmentId:string;employees:Employee[];conn:StudentConnectionState}) {
  const [employee,setEmployee]=useState(''), [code,setCode]=useState('');
  if (conn.rows === null) return null;
  const rows=conn.rows;
  const available=employees.filter(p=>p.telegramUrl&&p.employeeId!=='manager'&&!rows.some(r=>r.employeeId===p.employeeId));
  const selected=available.find(p=>p.employeeId===employee)?.employeeId||available[0]?.employeeId;
  // A connection whose employee is on another page of the roster still needs a way to be released.
  const elsewhere=rows.filter(r=>!employees.some(p=>p.employeeId===r.employeeId));
  const connected=rows.filter(r=>r.status==='active'&&employees.some(p=>p.employeeId===r.employeeId)).length;
  return <section aria-label="직원 보고 연결" className={styles.setup}><h3>직원 보고 연결 <small>{connected} / {employees.length}명 연결됨</small></h3>
    <p>직원(봇)이 맡은 일의 시작과 결과를 이 사무실로 보내도록 연결해요. 직원마다 한 번만 하면 돼요.</p>
    <ol className={styles.steps}>
      <li><strong>보고 스킬 설치</strong><span><a className={styles.download} href={`/api/campus/office/skill?enrollmentId=${encodeURIComponent(enrollmentId)}`} download>Aside 보고 스킬 받기</a> 압축을 풀고 내 Aside 계정의 <code>skills/user</code>에 <code>moonshot-campus-report</code> 폴더를 넣으세요.</span></li>
      <li><strong>연결 코드 받기</strong><span>봇 대화에 <strong>/new</strong>를 한 번 보낸 뒤 <strong>캠퍼스 연결 준비</strong>를 보내세요. 받은 코드는 10분 동안 쓸 수 있어요. 실패하면 Aside 앱의 File permissions에 내 Aside 계정의 <code>campus-office</code> 폴더를 추가(허용)하고 다시 시도하세요.</span></li>
      <li><strong>코드 입력</strong><span>아래에서 직원을 고르고 받은 코드를 넣으세요. 직원 카드에 나오는 확인 명령을 같은 대화에 보내면 연결이 끝나요.</span></li>
    </ol>
    {available.length>0&&<form className={styles.pair} onSubmit={async e=>{e.preventDefault();if(selected&&await conn.pair(selected,code.trim()))setCode('');}}>
      <label>연결할 직원<select value={selected} onChange={e=>setEmployee(e.target.value)}>{available.map(p=><option value={p.employeeId} key={p.employeeId}>{p.name}</option>)}</select></label>
      <label>직원이 보낸 연결 코드<input value={code} onChange={e=>setCode(e.target.value)} maxLength={82} autoComplete="off" spellCheck={false} placeholder="MS1-…"/></label>
      <button type="submit" className={styles.primary} disabled={conn.busy||!/^MS1-\d{10}-[\da-f]{64}$/.test(code.trim())}>연결 요청</button>
    </form>}
    {!rows.length&&!available.length&&<p>텔레그램 봇 주소가 있는 직원을 먼저 추가하세요.</p>}
    {employees.length>0&&!available.length&&connected===employees.length&&<p className={styles.done}>모든 직원이 연결됐어요. 텔레그램에서 평소 말로 일을 맡기면 결과가 작업함에 나타나요.</p>}
    {elsewhere.length>0&&<div className={styles.links}>{elsewhere.map(r=><div key={r.id} className={styles.link} data-status={r.status}>
      <div><strong>목록의 다른 쪽에 있는 직원</strong><span>{connectionLabel(r.status)}</span></div>
      {r.confirmation&&<p>같은 Telegram 대화에 보내세요. <code>캠퍼스 연결 확인 {r.confirmation}</code></p>}
      <div className={styles.controls}><button className={styles.quiet} disabled={conn.busy} onClick={()=>void conn.revoke(r.id)}>연결 해제</button></div></div>)}</div>}
    <div className={styles.controls}><button type="button" disabled={conn.busy} onClick={()=>void conn.refresh()}>연결 상태 새로고침</button><span className={styles.note}>연결한 뒤에는 “공지 초안 써줘”처럼 부탁하세요. 인사와 일반 질문은 대화에만 남아요. 스킬을 새로 받았을 때는 봇마다 /new만 보내면 되고, 연결은 그대로 유지돼요.</span></div>
    {conn.message&&<p role="status" className={styles.notice}>{conn.message}</p>}
  </section>;
}
