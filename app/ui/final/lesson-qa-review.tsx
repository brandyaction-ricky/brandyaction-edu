'use client';
import { useRef, useState } from 'react';
import { questionRequest } from './question-composer';
import { qaPreviewBody, type QaAnchor } from '@/lib/lesson-qa';
import { LessonText } from './lesson-text';
type Source = { lessonId: string; lessonTitle: string; questionStamp: string; publicStamp: string; cohortStamp: string; authorHead: string | null; draftPending: boolean; applied: boolean; cohorts: { id: string; name: string }[]; anchors: QaAnchor[]; canPublish: boolean };
type Plan = { id: string; digest: string; title: string; answer: string; applied: boolean };
export function LessonQaReview({ questionId, locked, onChanged, onDirtyChange, onBusyChange }: { questionId: string; locked: boolean; onChanged: () => void; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void }) {
  const [source, setSource] = useState<Source | null>(null), [plan, setPlan] = useState<Plan | null>(null);
  const [title, setTitle] = useState(''), [answer, setAnswer] = useState(''), [anchor, setAnchor] = useState('');
  const [privacy, setPrivacy] = useState(false), [cohorts, setCohorts] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [uncertain, setUncertain] = useState(false);
  const gate = useRef(false), request = useRef('');
  function edit() { setPlan(null); setPrivacy(false); setCohorts(false); request.current = ''; onDirtyChange(true); }
  async function run(action: 'load' | 'prepare' | 'approve') {
    if (gate.current || locked || (uncertain && action !== 'approve')) return; gate.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('');
    try {
      if (action === 'load') {
        setSource(await questionRequest<Source>('/api/admin/questions/lesson-qa?question=' + questionId));
        setPlan(null); setAnchor(''); setPrivacy(false); setCohorts(false); request.current = '';
      } else if (action === 'prepare' && source) {
        const selected = source.anchors.find((_, i) => String(i) === anchor);
        if (!selected) throw new Error('삽입 위치를 선택해 주세요.');
        if (!request.current) request.current = crypto.randomUUID();
        setPlan(await questionRequest<Plan>('/api/admin/questions/lesson-qa', { action, questionId, requestId: request.current, questionStamp: source.questionStamp, publicStamp: source.publicStamp, cohortStamp: source.cohortStamp, authorHead: source.authorHead, blockId: selected.blockId, node: selected.node, title, answer }));
        setPrivacy(false); setCohorts(false); setNotice('검토본을 고정했습니다. 실제 답변과 수업은 아직 바뀌지 않았습니다.');
      } else if (action === 'approve' && plan) {
        const result = await questionRequest<{ id: string; published: boolean }>('/api/admin/questions/lesson-qa', { action, planId: plan.id, digest: plan.digest, privacyReviewed: privacy, allCohortsReviewed: cohorts });
        if (result.id !== plan.id || result.published !== true) throw new Error('반영 결과를 확인하지 못했습니다. 같은 검토본으로 다시 확인해 주세요.');
        setUncertain(false); setPlan({ ...plan, applied: true }); onDirtyChange(false); setNotice('답변과 수업 반영을 함께 확인했습니다.'); onChanged();
      }
    } catch (e) { const failure = e as { message: string; status?: number }; setError(failure.message); if (action === 'approve' && (!failure.status || failure.status >= 500)) setUncertain(true); }
    finally { gate.current = false; setBusy(false); onBusyChange(false); }
  }
  const disabled = locked || busy, editDisabled = disabled || uncertain || Boolean(plan?.applied);
  return <details className="question-assist-tools"><summary>수업에 질문·답변 반영 검토</summary>
    <p className="meta">공개 수업의 설명 바로 아래에 ‘먼저 본 수강생의 질문’을 접힌 상자로 넣습니다. 원문 작성자·연락처·개인 폴더·첨부 이미지는 공개하지 않습니다.</p>
    <button type="button" className="btn small" disabled={disabled || uncertain} onClick={() => void run('load')}>{source ? '최신 공개본 다시 확인' : '삽입 위치 확인'}</button>
    {error && <p role="alert">{error}</p>}
    {source && <><p>{source.lessonTitle} · 같은 상품의 모든 기수에 적용</p><p className="meta">연결 기수: {source.cohorts.map(c => c.name).join(', ') || '없음'}</p>
      {source.draftPending || source.applied ? <p role="status">{source.applied ? '이 질문은 이미 수업에 반영됐습니다.' : '다른 편집 초안이 있어 반영 준비를 중단했습니다. 기존 초안을 먼저 확인해 주세요.'}</p> : <>
        <label className="field">설명 다음 삽입 위치<select disabled={editDisabled} value={anchor} onChange={e => { setAnchor(e.target.value); edit(); }}><option value="">위치 선택</option>{source.anchors.map((item, i) => <option key={item.blockId + ':' + item.node} value={String(i)}>{item.label}</option>)}</select></label>
        <label className="field">개인정보를 지운 질문 제목<input maxLength={200} disabled={editDisabled} value={title} onChange={e => { setTitle(e.target.value); edit(); }}/></label>
        <label className="field">학생 답변과 수업에 사용할 동일한 답변<textarea rows={6} maxLength={10000} disabled={editDisabled} value={answer} onChange={e => { setAnswer(e.target.value); edit(); }}/></label>
        <button type="button" className="btn small" disabled={editDisabled || !title.trim() || !answer.trim() || !anchor} onClick={() => void run('prepare')}>검토본 고정·미리보기</button>
        {plan && <section aria-label="고정한 질문·답변 검토본"><h3>먼저 본 수강생의 질문</h3><LessonText text={qaPreviewBody(plan.title, plan.answer)}/><p className="meta">선택한 설명 단락 바로 다음에 들어갑니다. 답변·문구·위치는 이 검토본으로 함께 고정됐습니다.</p>
          {!plan.applied && <><label className="check-row"><input type="checkbox" disabled={disabled} checked={privacy} onChange={e => setPrivacy(e.target.checked)}/> 개인정보·첨부를 제외했고 공개해도 되는 문구를 확인했습니다.</label><label className="check-row"><input type="checkbox" disabled={disabled} checked={cohorts} onChange={e => setCohorts(e.target.checked)}/> 같은 상품의 모든 기수에 영향을 주는 것을 확인했습니다.</label>
          {source.canPublish ? <button type="button" className="btn" disabled={disabled || !privacy || !cohorts} onClick={() => void run('approve')}>{uncertain ? '같은 검토본으로 반영 결과 재확인' : '이 검토본 승인·답변과 수업 반영'}</button> : <p role="status">현재는 검토본 준비 단계입니다. 실제 답변·수업 반영은 별도 승인 후 사용할 수 있습니다.</p>}</>}
        </section>}
      </>}
    </>}
    {notice && <p role="status">{notice}</p>}
  </details>;
}
