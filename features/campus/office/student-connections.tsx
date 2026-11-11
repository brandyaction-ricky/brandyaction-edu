'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './agents/panel.module.css';
import { createClient } from '@/lib/supabase/client';

type Employee = { employeeId: string; name: string; telegramUrl: string | null };
type Connection = { id: string; employeeId: string; status: 'pending'|'active'|'expired'; confirmation: string | null };

export function StudentConnections({enrollmentId,employees,onJobs}:{enrollmentId:string;employees:Employee[];onJobs?:(employee:{id:string;name:string})=>void}) {
  const [rows,setRows]=useState<Connection[]|null>(null);
  const [employee,setEmployee]=useState(''), [code,setCode]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false);
  const locked=useRef(false);
  const rpc=useCallback(async (action:string, employeeId:string|null=null, pairing:string|null=null, id:string|null=null)=>{
    const {data,error}=await createClient().rpc('edu_campus_student_connection',{
      p_enrollment:enrollmentId,p_action:action,p_employee:employeeId,p_code:pairing,p_id:id,
    });
    if(error)throw Error(error.code==='42501'?'이 수강권과 직원의 연결 권한을 확인해 주세요.':error.code==='23514'?'코드가 만료되었거나 형식이 다릅니다. 직원에게 새 코드를 요청하세요.':error.code==='23505'||error.code==='40001'?'이미 사용한 코드이거나 기존 연결이 있어요. 연결 상태를 확인하세요.':'연결 상태를 확인하지 못했어요. 다시 시도해 주세요.');
    return data;
  },[enrollmentId]);
  useEffect(()=>{let current=true;
    const load=()=>rpc('list').then(data=>{if(current)setRows(data);}).catch(e=>{if(current)setMessage(e.message);});
    void load();window.addEventListener('focus',load);
    return ()=>{current=false;window.removeEventListener('focus',load);};
  },[rpc]);
  const available=employees.filter(p=>p.telegramUrl&&p.employeeId!=='manager'&&!rows?.some(r=>r.employeeId===p.employeeId));
  const selected=available.find(p=>p.employeeId===employee)?.employeeId||available[0]?.employeeId;
  async function act(action:string,id:string|null=null){
    if(locked.current)return;locked.current=true;setBusy(true);setMessage('');
    try{
      if(action!=='list')await rpc(action,selected||null,action==='pair'?code.trim():null,id);
      setRows(await rpc('list'));
      if(action==='pair'){setCode('');setMessage('같은 직원 대화에서 아래 확인 명령을 보내세요.');}
      if(action==='revoke')setMessage('연결을 해제했어요. 기존 업무와 결과는 작업함에서 볼 수 있어요.');
    }catch(e){setMessage((e as Error).message);}finally{locked.current=false;setBusy(false);}
  }
  return <section aria-label="직원 보고 연결"><h3>직원 보고 연결</h3>
    <p><a href="/campus/downloads/moonshot-campus-report.zip" download>Aside 보고 스킬 받기</a> · 압축을 풀고 내 Aside 계정의 <code>skills/user</code>에 <code>moonshot-campus-report</code> 폴더를 넣으세요.</p>
    <p>내 Telegram 봇의 개인 대화에서 <strong>캠퍼스 연결 준비</strong>를 보내세요. 받은 코드는 10분 동안 사용할 수 있어요.</p>
    <p>새 스킬로 연결한 뒤에는 “공지 초안 써줘”처럼 부탁하세요. 맡긴 업무의 요약과 결과가 내 작업함에 표시됩니다. 인사와 일반 질문은 대화에만 남아요.</p>
    {rows&&available.length>0&&<form onSubmit={e=>{e.preventDefault();void act('pair');}}>
      <label>연결할 직원<select value={selected} onChange={e=>setEmployee(e.target.value)}>{available.map(p=><option value={p.employeeId} key={p.employeeId}>{p.name}</option>)}</select></label>
      <label>직원이 보낸 연결 코드<input value={code} onChange={e=>setCode(e.target.value)} maxLength={82} autoComplete="off" spellCheck={false}/></label>
      <button type="submit" disabled={busy||!/^MS1-\d{10}-[\da-f]{64}$/.test(code.trim())}>연결 요청</button>
    </form>}
    {rows&&!rows.length&&!available.length&&<p>텔레그램 봇 주소가 있는 직원을 먼저 추가하세요.</p>}
    {rows?.map(r=>{
      const profile=employees.find(p=>p.employeeId===r.employeeId);
      const name=profile?.name||r.employeeId;
      return <div key={r.id}><strong>{name}</strong>
      <p>{r.status==='active'?'업무 보고 연결됨':r.status==='expired'?'확인 기간 만료 · 해제 후 다시 연결하세요.':'직원 확인 대기'}</p>
      {r.confirmation&&<p>같은 Telegram 대화에 보내세요. <code>캠퍼스 연결 확인 {r.confirmation}</code></p>}
      {r.status==='active'&&<div className={styles.controls}>
        {profile?.telegramUrl&&<a href={profile.telegramUrl} target="_blank" rel="noopener noreferrer">Telegram에서 업무 맡기기 ↗</a>}
        {onJobs&&<button type="button" onClick={()=>onJobs({id:r.employeeId,name})}>이 직원의 작업함 열기</button>}
      </div>}
      <button disabled={busy} onClick={()=>void act('revoke',r.id)}>연결 해제</button></div>;
    })}
    <button disabled={busy} onClick={()=>void act('list')}>연결 상태 새로고침</button>
    {message&&<p role="status">{message}</p>}
  </section>;
}
