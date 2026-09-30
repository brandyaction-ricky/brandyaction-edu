"use client";

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { number as num, text as t } from '@/lib/platform';
import { curriculumFingerprint, curriculumRows, lessonReady, plannedVisibility, visibilityKey, visibilityPlan, type VisibilityDraft } from '@/lib/curriculum-controls';
import type { Data, WorkflowSend } from '../learning-workflows';

export async function readCurriculum(courseId: string): Promise<Data> {
  const response = await fetch(`/api/platform?admin=1&section=products&record=${encodeURIComponent(courseId)}&part=curriculum`, {cache:'no-store'});
  const result = await response.json();
  if (!response.ok || !result.data) throw new Error(result.error || '최신 커리큘럼을 확인하지 못했습니다.');
  return result.data;
}
export function CurriculumVisibility({ courseId, initial, send, onRefresh, onClose }: {
  courseId: string; initial: Data; send: WorkflowSend; onRefresh: (data: Data) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const applying = useRef(false);
  const [data, setData] = useState(initial);
  const [draft, setDraft] = useState<VisibilityDraft>({});
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const {weeks,lessons} = curriculumRows(data,courseId);
  const plan = visibilityPlan(data,courseId,draft);
  useEffect(() => { const element=dialog.current; element?.showModal(); return ()=>element?.close(); }, []);
  function accept(next: Data) { setData(next); onRefresh(next); }
  async function refresh() {
    setBusy(true);
    try { accept(await readCurriculum(courseId)); setUncertain(false); setError(''); setNotice('현재 저장된 상태를 확인했습니다. 남은 변경 내용을 다시 확인해 주세요.'); }
    catch { setError('저장 상태를 확인하지 못했습니다. 다시 확인한 뒤 진행해 주세요.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (applying.current || uncertain || !plan.changes.length || plan.invalid.length) return;
    applying.current = true; setBusy(true); setError(''); setNotice('');
    let started = false;
    try {
      const fresh = await readCurriculum(courseId);
      if (curriculumFingerprint(fresh,courseId) !== curriculumFingerprint(data,courseId)) {
        accept(fresh); setDraft({}); setReview(false); setError('다른 곳에서 커리큘럼이 변경됐습니다. 최신 내용을 불러왔습니다. 공개 범위를 다시 선택해 주세요.'); return;
      }
      if (visibilityPlan(fresh,courseId,draft).invalid.length) {
        accept(fresh); setReview(false); setError('본문이 없는 수업은 공개할 수 없습니다. 내용을 저장하거나 해당 수업의 체크를 해제해 주세요.'); return;
      }
      for (const change of plan.changes) {
        started = true;
        if (!change.row.updated_at) throw new Error('수정 시각을 확인하지 못했습니다. 화면을 다시 열어 주세요.');
        await send({action:'save',section:change.section,id:change.row.id,expectedUpdatedAt:change.row.updated_at,values:{is_published:change.value}});
      }
      accept(await readCurriculum(courseId)); setDraft({}); setReview(false); setNotice('공개 범위를 저장하고 현재 상태를 확인했습니다.');
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '저장하지 못했습니다.';
      setReview(false);
      if (started) {
        try { accept(await readCurriculum(courseId)); setError(`저장을 중단했습니다. ${detail} 저장된 항목은 반영했고, 남은 변경만 아래에 표시합니다.`); }
        catch { setUncertain(true); setError('일부 항목이 저장됐을 수 있지만 현재 상태를 확인하지 못했습니다. 저장 상태 다시 확인을 눌러 주세요.'); }
      } else setError(detail);
    } finally { applying.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="studio-control-dialog" aria-labelledby="visibility-title" onCancel={event => {event.preventDefault();if(!busy)onClose();}}>
    <header><div><p className="meta">커리큘럼 관리</p><h2 id="visibility-title">수업 공개 범위</h2></div><button type="button" className="btn" aria-label="공개 범위 닫기" disabled={busy} onClick={onClose}><X size={20}/></button></header>
    <p>주차와 수업을 모두 체크하면 공개됩니다. 같은 상품의 모든 기수에 적용되며, 수강 기간·학습 순서에 따른 접근 조건은 유지됩니다.</p>
    <p className="meta">무료 미리보기 설정은 여기서 바뀌지 않습니다. 체크한 뒤 ‘변경 내용 확인’을 눌러 주세요.</p>
    {error && <p role="alert" className="notice warning">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
    {plan.invalid.length > 0 && <p role="alert" className="notice warning">본문이 없는 수업은 공개할 수 없습니다: {plan.invalid.map(row=>t(row,'title')).join(', ')}. 해당 수업의 체크를 해제하거나 본문을 먼저 저장해 주세요.</p>}
    {uncertain ? <button type="button" className="btn" disabled={busy} onClick={() => void refresh()}>저장 상태 다시 확인</button> : review ? <section aria-label="공개 변경 확인" className="studio-visibility-review">
      <h3>수강생에게 보이는 내용이 이렇게 바뀝니다</h3>
      <p>새로 공개 {plan.impacts.filter(row=>row.after).length}개 · 비공개 전환 {plan.impacts.filter(row=>!row.after).length}개</p>
      <ul>{plan.impacts.map(({lesson,week,after})=><li key={lesson.id}><b>{after?'공개':'비공개'}</b><span>{num(week,'week_number')}주차 · {t(lesson,'title')}{after && lesson.is_preview ? ' · 무료 미리보기 설정 있음' : ''}</span></li>)}</ul>
      {!plan.impacts.length && <p>현재 수강생에게 보이는 수업 수는 그대로입니다. 비공개 주차의 수업 설정도 주차를 공개할 때 적용됩니다.</p>}
      <details><summary>변경하는 설정 {plan.changes.length}개 보기</summary><ul>{plan.changes.map(({section,row,value})=><li key={visibilityKey(section,String(row.id))}>{section==='weeks'?'주차':'수업'} · {t(row,'title')} → {value?'공개':'비공개'}</li>)}</ul></details>
      <p className="meta">항목별로 저장됩니다. 중간에 실패하면 멈추고 저장된 상태와 남은 변경을 보여드립니다.</p>
    </section> : <div className="studio-visibility-list">{weeks.map(week=><section key={week.id}>
      <label className="studio-visibility-week"><input type="checkbox" checked={plannedVisibility(week,'weeks',draft)} disabled={busy} onChange={event=>setDraft({...draft,[visibilityKey('weeks',String(week.id))]:event.target.checked})}/><span>{num(week,'week_number')}주차 · {t(week,'title')}</span></label>
      {lessons.filter(lesson=>lesson.week_id===week.id).map(lesson=>{
        const checked=plannedVisibility(lesson,'learning',draft), open=plannedVisibility(week,'weeks',draft), ready=lessonReady(lesson,data);
        return <label key={lesson.id} className="studio-visibility-lesson"><input type="checkbox" checked={checked} disabled={busy || (!checked && !ready)} onChange={event=>setDraft({...draft,[visibilityKey('learning',String(lesson.id))]:event.target.checked})}/><span><b>{num(lesson,'day_number')}일차 · {t(lesson,'title')}</b><small>{!ready?'본문을 먼저 저장해 주세요':checked?(open?'공개 예정':'주차 비공개로 숨김'):'비공개'}{lesson.is_preview?' · 무료 미리보기 설정 있음':''}</small></span></label>;
      })}
    </section>)}</div>}
    <footer><span role="status">{busy?'저장 상태를 확인하고 있습니다…':`변경 ${plan.changes.length}개`}</span><div><button type="button" className="btn" disabled={busy} onClick={()=>review?setReview(false):onClose()}>{review?'선택 수정':'닫기'}</button><button type="button" className="btn primary" disabled={busy || uncertain || !plan.changes.length || Boolean(plan.invalid.length)} onClick={()=>review?void apply():setReview(true)}>{review?'확인한 공개 범위 적용':'변경 내용 확인'}</button></div></footer>
  </dialog>;
}
