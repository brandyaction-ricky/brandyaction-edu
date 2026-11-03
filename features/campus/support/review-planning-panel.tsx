'use client';
import {useState,type FormEvent} from 'react';
import type {ReviewWindow,ReviewMission} from './review-planning';
import {useCampusDraftGuard} from '../ui/draft-guard';
import s from './panel.module.css';

export function ReviewPlanningPanel({missions,windows,busy,onSave}:{missions:ReviewMission[];windows:ReviewWindow[];busy:boolean;onSave:(v:Record<string,unknown>)=>Promise<boolean>}){
 const [mission,setMission]=useState(''),[planned,setPlanned]=useState('');
 useCampusDraftGuard(Boolean(mission||planned),busy);
 async function submit(e:FormEvent){e.preventDefault();const current=windows.find(w=>w.mission_id===mission);if(await onSave({kind:'review-plan',id:current?.id||crypto.randomUUID(),missionId:mission,plannedAt:new Date(planned).toISOString(),revision:current?.revision||0})){setMission('');setPlanned('');}}
 return <section className={s.card}><h3>과제 제출 확인 계획</h3><p className={s.muted}>운영자가 제출 현황을 확인할 날짜입니다. 수강생의 제출 마감이나 수강 권한을 바꾸지 않습니다. 예상 대상은 확인 시점의 유효 수강생입니다.</p><form className={s.form} onSubmit={submit}><label>확인할 과제<select required value={mission} onChange={e=>setMission(e.target.value)}><option value="">과제 선택</option>{missions.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label><label>확인 예정 (현재 기기의 시간대)<input type="datetime-local" required value={planned} onChange={e=>setPlanned(e.target.value)}/></label><button className={s.primary} disabled={busy||!missions.length}>확인 계획 저장</button></form><div className={s.list}>{!windows.length&&<p>등록한 확인 계획이 없습니다.</p>}{windows.map(w=><article className={s.item} key={w.id}><strong>{missions.find(m=>m.id===w.mission_id)?.title||'기존 과제'}</strong><p>{new Date(w.planned_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST · {w.status==='cancelled'?'취소':'확인 예정'}</p>{w.status==='planned'&&<button disabled={busy} onClick={()=>void onSave({kind:'cancel-review-plan',id:w.id,revision:w.revision})}>확인 계획 취소</button>}</article>)}</div></section>;
}
