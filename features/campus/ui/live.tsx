'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createEduBridge, type EduBridge, type BridgeState } from '@/public/campus/edu-bridge.mjs';
import type { CampusSnapshot } from '../contracts';
import type { CampusAdminSnapshot } from '../admin-metrics';
import type { CampusAdminOptions } from '../admin-repository';
import { CampusFrame, LearnerDashboard, AdminDashboard, campusStyles as styles } from './dashboard';

export function LearnerLive() {
  const [state,setState] = useState<BridgeState>({status:'loading',snapshot:null});
  const [notice,setNotice] = useState('');
  const [selected,setSelected] = useState<string|null>(null);
  const bridge = useRef<EduBridge|null>(null);
  useEffect(() => {
    const connection = createEduBridge({onState:setState}); bridge.current = connection;
    connection.load().then(context => { const first = context.scopes[0]?.enrollmentId; if(first){setSelected(first);return connection.load(first);} }).catch(() => {});
    return () => {connection.dispose();bridge.current=null;};
  },[]);
  function request(pending:Promise<unknown>|undefined){setNotice('');pending?.catch(error=>{if(error.name!=='AbortError')setNotice(error.message);});}
  return <CampusFrame>{notice && <p role="alert">{notice}</p>}{state.status === 'ready' ? <LearnerDashboard snapshot={state.snapshot as CampusSnapshot} onSelect={id=>{setSelected(id);request(bridge.current?.load(id));}} onRefresh={()=>request(bridge.current?.load(selected))} onOpen={(lesson,mission)=>{if(selected)request(mission?bridge.current?.openMission(selected,lesson,mission):bridge.current?.openLesson(selected,lesson));}}/> : <div className={styles.empty} role={state.status==='error'?'alert':'status'}><h1>{state.status==='error'?'학습 기록을 확인해 주세요':'학습 기록을 불러오고 있어요'}</h1>{state.status==='error' && <><p>{state.message}</p><button className={styles.secondary} onClick={()=>request(bridge.current?.load(selected))}>다시 시도</button> <button className={styles.secondary} onClick={()=>{setSelected(null);request(bridge.current?.load());}}>수강 기수 다시 확인</button> <Link href="/login?next=%2Fcampus">로그인</Link> · <Link href="/my/classes">내 클래스</Link></>}</div>}</CampusFrame>;
}
export function AdminLive({studySettings=false}: {studySettings?:boolean} = {}) {
  const [options,setOptions] = useState<CampusAdminOptions['cohorts']>([]);
  const [selected,setSelected] = useState('');
  const [snapshot,setSnapshot] = useState<CampusAdminSnapshot|null>(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const active = useRef<AbortController|null>(null);
  const generation = useRef(0);
  async function load(id='') {
    active.current?.abort();const token=++generation.current;const controller=new AbortController();active.current=controller;
    setSnapshot(null);setLoading(true);setError('');
    try {
      const result=await fetch('/api/campus/admin'+(id?'?cohortId='+encodeURIComponent(id):''),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!result.ok)throw new Error(result.status===403||result.status===401?'회원 관리 권한과 로그인 상태를 확인해 주세요.':'기수 기록을 불러오지 못했습니다. 다시 시도해 주세요.');
      const data=await result.json();if(token!==generation.current||controller.signal.aborted)return;
      if(id)setSnapshot(data);else {setOptions(data.cohorts);if(data.cohorts.length){setSelected(data.cohorts[0].id);await load(data.cohorts[0].id);}}
    }catch(err){if(token===generation.current&&!controller.signal.aborted)setError(err instanceof Error?err.message:'조회에 실패했습니다.');}
    finally{if(token===generation.current)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{++generation.current;active.current?.abort();};},[]); // eslint-disable-line react-hooks/exhaustive-deps
  return <CampusFrame admin><div className={styles.tools}>{studySettings && <Link className="btn small" href="/admin/campus/study">기수별 캠퍼스 수업 설정</Link>}<label htmlFor="admin-campus-cohort">확인할 기수</label><select id="admin-campus-cohort" value={selected} onChange={e=>{setSelected(e.target.value);void load(e.target.value);}}><option value="" disabled>기수를 선택해 주세요</option>{options.map(o=><option key={o.id} value={o.id}>{o.courseTitle} · {o.name}</option>)}</select></div>{loading?<div className={styles.empty} role="status">기수 기록을 불러오고 있어요.</div>:error?<div className={styles.empty} role="alert">{error}<button onClick={()=>void load(selected)}>다시 시도</button></div>:snapshot?<AdminDashboard snapshot={snapshot} onRefresh={()=>void load(selected)}/>:<p className={styles.empty}>조회 가능한 기수가 없습니다.</p>}</CampusFrame>;
}
