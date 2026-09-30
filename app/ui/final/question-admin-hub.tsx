'use client';
import { useEffect, useRef, useState } from 'react';
import { questionRequest } from './question-composer';
import { useUnsavedWarning } from '@/features/admin-ui';
type HubState = { question: { sharing_requested: boolean; category: string; lesson_id: string | null }; shared: { title: string; answer: string; published: boolean } | null; job: { id: string; status: string; draft: string | null; expected_head: string | null } | null };
export function QuestionAdminHub({ questionId, locked, headId, onUseDraft, onDirtyChange, onBusyChange }: { questionId: string; locked: boolean; headId: string | null; onUseDraft: (draft: string, jobId: string) => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void }) {
  const [data, setData] = useState<HubState | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0);
  const [title, setTitle] = useState(''), [answer, setAnswer] = useState(''), [reviewed, setReviewed] = useState(false), [published, setPublished] = useState(false), [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState(''), [handoff, setHandoff] = useState(''), [busy, setBusy] = useState(false);
  const requestId = useRef(''), gate = useRef(false);
  useUnsavedWarning(dirty || Boolean(draft) || busy);
  useEffect(() => { onDirtyChange(dirty || Boolean(draft)); return () => onDirtyChange(false); }, [dirty, draft, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    void questionRequest<HubState>('/api/admin/questions/hub?question=' + questionId, undefined, abort.signal).then(value => {
      if (!alive) return; setData(value); setTitle(value.shared?.title || ''); setAnswer(value.shared?.answer || ''); setPublished(Boolean(value.shared?.published)); setDirty(false); setError('');
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; abort.abort(); };
  }, [questionId, version]);
  async function write(action: 'publish' | 'export' | 'import') {
    if (gate.current || locked) return; gate.current = true; setBusy(true); setError(''); setNotice('');
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const result = await questionRequest<{ job?: { id: string; status: string; draft: string | null; expectedHeadId: string | null }; handoff?: unknown }>('/api/admin/questions/hub', { action, questionId, requestId: action === 'import' ? data?.job?.id : requestId.current, title, answer, reviewed, published, draft });
      if (action === 'publish') { setDirty(false); setReviewed(false); setNotice(published ? '공유 답변을 게시했습니다.' : '공유 답변을 숨겼습니다.'); }
      if (result.job) { setData(old => old ? { ...old, job: { ...result.job!, expected_head: result.job!.expectedHeadId } } : old); }
      if (result.handoff) setHandoff(JSON.stringify(result.handoff, null, 2));
      if (action === 'import') { setDraft(''); setNotice('초안을 저장했습니다. 검토 후 답변 입력란에 넣어 주세요.'); }
      if (action === 'export') setNotice('연결용 자료를 준비했습니다. 자동 전송이나 AI 호출은 하지 않습니다.');
    } catch (e) { setError((e as Error).message); }
    finally { gate.current = false; setBusy(false); }
  }
  const disabled = locked || busy;
  return <section className="question-assist-tools" aria-label="질문 공유와 어사이드 연결">
    {error && <p role="alert">{error} {!data && <button className="btn small" disabled={disabled} onClick={() => setVersion(v => v + 1)}>다시 불러오기</button>}</p>}
    {data?.question.sharing_requested && <details><summary>함께 보는 답변 만들기</summary><p className="meta">수강생이 공유를 요청했습니다. 원문은 비공개로 두고, 개인정보를 지운 아래 내용만 같은 기수에 게시합니다. 같은 질문에는 이 답변이 자동 안내로 사용됩니다.</p><label className="field">공유할 질문 제목<input maxLength={200} value={title} disabled={disabled} onChange={e => { setTitle(e.target.value); setReviewed(false); setDirty(true); }}/></label><label className="field">공유할 답변<textarea rows={6} maxLength={10000} value={answer} disabled={disabled} onChange={e => { setAnswer(e.target.value); setReviewed(false); setDirty(true); }}/></label><label className="check-row"><input type="checkbox" checked={published} disabled={disabled} onChange={e => { setPublished(e.target.checked); setDirty(true); }}/> 함께 보는 답변에 게시</label><label className="check-row"><input type="checkbox" checked={reviewed} disabled={disabled} onChange={e => setReviewed(e.target.checked)}/> 이름·연락처·개인 사업정보를 지웠고 답변 내용을 확인했습니다.</label><button className="btn mt16" disabled={disabled || !reviewed || !title.trim() || !answer.trim()} onClick={() => void write('publish')}>공유 답변 저장</button></details>}
    {data?.question.category === 'learning' && data.question.lesson_id && <details><summary>어사이드 연결 준비</summary><p className="meta">어사이드 작업을 만들 때 사용할 질문과 공개된 수업 자료입니다. 현재는 자동 연결 전이며, 실제 답변은 검토 후 등록합니다. 첨부 이미지와 회원 정보는 내보내지 않습니다.</p><button className="btn small" disabled={disabled} onClick={() => void write('export')}>연결용 자료 준비</button>{handoff && <label className="field mt16">어사이드에 전달할 자료<textarea readOnly rows={5} value={handoff}/></label>}
      {data.job && data.job.expected_head !== headId ? <p role="status">답변이 변경되어 이 초안을 사용할 수 없습니다. 질문을 다시 열어 주세요.</p> : data.job && <><label className="field mt16">어사이드 답변 초안 가져오기<textarea rows={5} maxLength={10000} value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} placeholder="어사이드가 작성한 초안을 붙여넣어 주세요."/></label><button className="btn small" disabled={disabled || !draft.trim()} onClick={() => void write('import')}>초안 저장</button>{data.job.draft && <><p className="reading-copy mt16">{data.job.draft}</p><button className="btn small" disabled={disabled} onClick={() => onUseDraft(data.job!.draft!, data.job!.id)}>검토할 답변에 넣기</button></>}</>}
    </details>}
    {notice && <p role="status" className="notice">{notice}</p>}
  </section>;
}
