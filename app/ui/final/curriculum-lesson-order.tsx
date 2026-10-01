"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { number as num, text, type Row } from '@/lib/platform';
import type { Data } from '../learning-workflows';
import { readCurriculum } from './curriculum-visibility';
import './curriculum-lesson-order.css';

export function CurriculumLessonOrder({ courseId, weekId, onRefresh, onClose }: {
  courseId: string; weekId: string; onRefresh: (data: Data) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), applying = useRef(false);
  const [data, setData] = useState<Data | null>(null), [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [retry, setRetry] = useState(0);
  const week = data?.curriculum_weeks?.find(row => row.id === weekId && !row.archived_at);
  const lessons = (data?.curriculum_lessons || []).filter(row => row.week_id === weekId && !row.archived_at).toSorted((a,b) => num(a,'day_number') - num(b,'day_number'));
  const changed = ids.some((id,index) => id !== lessons[index]?.id);
  const accept = useCallback((next: Data) => {
    setData(next); setIds((next.curriculum_lessons || []).filter(row => row.week_id === weekId && !row.archived_at).toSorted((a,b) => num(a,'day_number') - num(b,'day_number')).map(row => String(row.id)));
  }, [weekId]);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    let active = true;
    readCurriculum(courseId).then(next => { if (active) accept(next); }).catch(() => { if (active) setError('수업 순서를 불러오지 못했습니다. 다시 시도해 주세요.'); });
    return () => { active = false; };
  }, [courseId, accept, retry]);
  function move(index: number, direction: -1 | 1) {
    const next = [...ids], target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [next[index],next[target]] = [next[target],next[index]];
    setIds(next); setNotice(`${text(lessons.find(row=>row.id===ids[index]),'title')}을 ${target+1}번째로 옮겼습니다. 아직 저장하지 않았습니다.`);
  }
  async function refresh() {
    if (applying.current) return;
    applying.current = true; setBusy(true);
    try { const next = await readCurriculum(courseId); accept(next); onRefresh(next); setUncertain(false); setError(''); setNotice('현재 저장된 순서입니다. 변경하려면 위·아래 버튼을 눌러 주세요.'); }
    catch { setError('저장 상태를 확인하지 못했습니다. 다시 확인한 뒤 진행해 주세요.'); }
    finally { applying.current = false; setBusy(false); }
  }
  async function save() {
    if (!week || !changed || uncertain || applying.current) return;
    applying.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/lesson-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        courseId, weekId, ids, expected: lessons.map(row => ({id: row.id, day: num(row,'day_number'), updatedAt: row.updated_at})),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '수업 순서를 저장하지 못했습니다.');
      const next = await readCurriculum(courseId); accept(next); onRefresh(next);
      setNotice('수업 순서를 저장했습니다.');
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '저장 결과를 확인하지 못했습니다.';
      try { const next = await readCurriculum(courseId); accept(next); onRefresh(next); setError(`${detail} 현재 저장된 순서를 불러왔습니다. 다시 확인해 주세요.`); }
      catch { setUncertain(true); setError('수업 순서가 저장됐을 수 있지만 현재 상태를 확인하지 못했습니다. 저장 상태 다시 확인을 눌러 주세요.'); }
    } finally { applying.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="studio-control-dialog lesson-order-dialog" aria-labelledby="lesson-order-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><p className="meta">{week ? `${num(week,'week_number')}주차 · ${text(week,'title')}` : '커리큘럼 관리'}</p><h2 id="lesson-order-title">수업 순서 바꾸기</h2></div><button className="btn" type="button" aria-label="수업 순서 닫기" disabled={busy} onClick={onClose}><X size={20}/></button></header>
    <p>위·아래 버튼으로 옮긴 뒤 저장해 주세요. 이 주차의 기존 일차 번호를 아래 순서대로 배정합니다.</p>
    <p className="notice">같은 상품의 모든 기수에 적용됩니다. 학습을 여는 순서에도 영향을 줄 수 있으니 확인해 주세요.</p>
    <p className="meta">수업 내용·공개 여부·기존 학습 기록은 그대로 유지됩니다. 삭제한 수업의 번호는 건너뜁니다. 데일리 미션·학습 &amp; 시험에 별도로 지정한 진행 일차는 유지됩니다.</p>
    {error && <p className="notice warning" role="alert">{error}</p>}
    {!data ? error ? <button className="btn" type="button" onClick={()=>{setError('');setRetry(value=>value+1);}}>다시 불러오기</button> : <p role="status">수업 순서를 불러오고 있습니다…</p> : !week ? <p role="alert">이 주차가 삭제됐습니다. 닫은 뒤 커리큘럼을 다시 열어 주세요.</p> : <ol className="lesson-order-list" aria-label="저장할 수업 순서">{ids.map((id,index) => {
      const row = lessons.find(item => item.id === id) as Row;
      const day = num(lessons[index],'day_number'), original = num(row,'day_number');
      return <li key={id}><div><b>{day}일차</b><span>{text(row,'title')}</span><small>{day === original ? '현재 일차 유지' : `현재 ${original}일차 → ${day}일차`}</small></div><div className="lesson-order-buttons"><button className="btn" type="button" aria-label={`${text(row,'title')} 위로`} disabled={busy || uncertain || index === 0} onClick={()=>move(index,-1)}><ArrowUp size={18}/></button><button className="btn" type="button" aria-label={`${text(row,'title')} 아래로`} disabled={busy || uncertain || index === ids.length-1} onClick={()=>move(index,1)}><ArrowDown size={18}/></button></div></li>;
    })}</ol>}
    <p role="status" className="meta">{busy ? '저장 상태를 확인하고 있습니다…' : notice || (changed ? '아직 저장하지 않은 순서입니다.' : '위·아래 버튼으로 순서를 바꿔 보세요.')}</p>
    {uncertain && <button className="btn" type="button" disabled={busy} onClick={()=>void refresh()}>저장 상태 다시 확인</button>}
    <footer><button className="btn" type="button" disabled={busy} onClick={onClose}>{changed ? '취소' : '닫기'}</button><button className="btn primary" type="button" disabled={busy || uncertain || !week || !changed || lessons.length < 2} onClick={()=>void save()}>{busy ? '저장 중…' : '이 순서로 저장'}</button></footer>
  </dialog>;
}
