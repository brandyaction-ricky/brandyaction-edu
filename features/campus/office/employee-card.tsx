'use client';
import {useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {officeStatusLabels,type OfficeJob} from './domain';
import {connectionLabel,useStudentConnections} from './student-connections';
import styles from './employee-card.module.css';

type Person={employeeId:string;name:string;telegramUrl:string|null;seatIndex:number};
/** What one employee is doing now: opened from the employee's desk in the office. */
export function EmployeeCard({enrollmentId,person,onClose,onInbox,onJob}:{enrollmentId:string;person:Person;onClose:()=>void;onInbox:()=>void;onJob:(jobId:string)=>void}){
 const [jobs,setJobs]=useState<OfficeJob[]|null>(null),[failed,setFailed]=useState(false);
 // Accounts without the reporting connection simply get no connection line.
 const conn=useStudentConnections(enrollmentId,true),link=conn.rows?.find(r=>r.employeeId===person.employeeId);
 useEffect(()=>{const c=new AbortController();
  void fetch('/api/campus/office?'+new URLSearchParams({enrollmentId,archived:'0',employee:person.employeeId}),{cache:'no-store',signal:c.signal})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error();if(!c.signal.aborted)setJobs(d.jobs);}).catch(()=>{if(!c.signal.aborted)setFailed(true);});
  return()=>c.abort();
 },[enrollmentId,person.employeeId]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
 const now=jobs?.find(j=>['queued','running'].includes(j.status)),recent=jobs?.filter(j=>j!==now&&j.draft_text).slice(0,2)??[];
 return <section role="dialog" aria-label={person.name+' 상태'} className={styles.card}>
  <header><div><strong>{person.name}</strong><small>{person.seatIndex?person.seatIndex+'번 자리':'총괄 관리자 자리'}{conn.rows&&' · '+(link?connectionLabel(link.status):'보고 미연결')}</small></div><button type="button" aria-label="직원 상태 닫기" onClick={onClose}><X size={18}/></button></header>
  <dl>
   <dt>지금 하는 일</dt>
   <dd>{failed?'업무를 불러오지 못했어요. 작업함에서 확인해 주세요.':!jobs?'불러오는 중…':now?<button type="button" onClick={()=>onJob(now.id)}><span data-status={now.status}>{officeStatusLabels[now.status]}</span>{now.objective}</button>:'지금 맡은 일이 없어요.'}</dd>
   <dt>최근 결과</dt>
   <dd>{!jobs&&!failed?'불러오는 중…':recent.length?<ul>{recent.map(j=><li key={j.id}><button type="button" onClick={()=>onJob(j.id)}><span data-status={j.status}>{officeStatusLabels[j.status]}</span>{j.objective}</button></li>)}</ul>:'아직 받은 결과가 없어요.'}</dd>
  </dl>
  <div className={styles.actions}><button type="button" onClick={onInbox}>이 직원 작업함 열기</button>{person.telegramUrl&&<a href={person.telegramUrl} target="_blank" rel="noopener noreferrer">텔레그램에서 업무 맡기기 ↗</a>}</div>
 </section>;
}
