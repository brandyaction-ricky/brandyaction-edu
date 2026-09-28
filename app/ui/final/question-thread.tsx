'use client';
import { useEffect, useRef, useState } from 'react';
import { AdminDrawer, useUnsavedWarning } from '@/features/admin-ui';
type Answer = { id: string; authorName: string; content: string; createdAt: string };
type Thread = { question: { id: string; title: string; content: string; learningContext?: string | null; status: string; resolved: boolean; archived: boolean; headId: string | null }; answers: Answer[]; nextCursor: string | null; canAnswer: boolean };
async function request<T>(question: string, body?: unknown, before?: string, signal?: AbortSignal): Promise<T> {
 const response = await fetch('/api/platform/question-thread?' + new URLSearchParams({ question, ...(before ? { before } : {}) }), {
  method: body ? 'POST' : 'GET', cache: 'no-store', signal: signal || AbortSignal.timeout(10000),
  ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
 });
 const value = await response.json(); if (!response.ok) throw Object.assign(new Error(value.error || '답변을 확인하지 못했습니다.'), { status: response.status }); return value;
}
function useThread(questionId: string, active = true) {
 const [revision, setRevision] = useState(0), [state, setState] = useState<{ key: string; data?: Thread; error?: string }>();
 const [olderError, setOlderError] = useState(''), [olderBusy, setOlderBusy] = useState(false);
 const key = questionId + ':' + revision, generation = useRef(key), olderGate = useRef(false);
 useEffect(() => { generation.current = key; }, [key]);
 useEffect(() => {
  if (!active) return; const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 10000); let alive = true;
  void request<Thread>(questionId, undefined, undefined, abort.signal).then(data => { if (alive) setState({ key, data }); }).catch(e => { if (alive) setState({ key, error: e.message || '답변을 불러오지 못했습니다.' }); }).finally(() => clearTimeout(timer));
  return () => { alive = false; abort.abort(); clearTimeout(timer); };
 }, [questionId, key, active]);
 const data = state?.key === key ? state.data : undefined;
 async function older() {
  if (!data?.nextCursor || olderGate.current) return; olderGate.current = true; setOlderBusy(true); setOlderError('');
  try { const result = await request<Thread>(questionId, undefined, data.nextCursor); if (generation.current === key) setState(old => old?.key === key && old.data ? { key, data: { ...old.data, answers: [...result.answers, ...old.data.answers], nextCursor: result.nextCursor } } : old); }
  catch (e) { if (generation.current === key) setOlderError((e as Error).message); }
  finally { olderGate.current = false; setOlderBusy(false); }
 }
 return { data, error: state?.key === key ? state.error : undefined, reload: () => { setRevision(v => v + 1); setOlderError(''); }, older, olderBusy, olderError };
}
function Answers({ state }: { state: ReturnType<typeof useThread> }) {
 return <section aria-label="질문 답변 이력">
  {state.error ? <p role="alert">{state.error} <button type="button" className="btn small" onClick={state.reload}>답변 다시 불러오기</button></p> : !state.data ? <p role="status">답변을 불러오고 있습니다.</p> : <>
   {state.data.nextCursor && <button type="button" className="btn small" disabled={state.olderBusy} onClick={() => void state.older()}>이전 답변 더 보기</button>}
   {state.olderError && <p role="alert">{state.olderError}</p>}
   {!state.data.answers.length && <p>{state.data.question.resolved ? '운영자가 처리 완료했습니다.' : '아직 등록된 답변이 없습니다.'}</p>}
   {state.data.answers.map(answer => <article className="answer mt16" key={answer.id}><b>{answer.authorName}</b><p className="meta">{new Date(answer.createdAt).toLocaleString('ko-KR')}</p><p className="reading-copy">{answer.content}</p></article>)}
  </>}
 </section>;
}
export function QuestionAnswerHistory({ questionId, fallback = '' }: { questionId: string; fallback?: string }) {
 const [open, setOpen] = useState(false), state = useThread(questionId, open);
 return <div className="mt16">{open ? <Answers state={state}/> : fallback ? <div className="answer"><b>운영자 답변</b><p className="reading-copy">{fallback}</p></div> : <p className="meta">답변이 도착하면 이곳에서 확인해 주세요.</p>}
  <div className="row mt16"><button type="button" className="btn small" onClick={() => setOpen(v => !v)}>{open ? '답변 이력 접기' : '답변 전체 보기'}</button>{open && <button type="button" className="btn small" onClick={state.reload}>최신 답변 확인</button>}</div>
 </div>;
}
export function QuestionThreadDialog({ questionId, close, changed, archive, pending = false }: { questionId: string; close: () => void; changed?: () => void; archive?: () => void; pending?: boolean }) {
 const state = useThread(questionId), [content, setContent] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [stale, setStale] = useState(false), [notice, setNotice] = useState('');
 const [aiBusy, setAiBusy] = useState(false), gate = useRef(false);
 const retry = useRef<{ action: 'answer' | 'resolve'; questionId: string; content?: string; requestId?: string; expectedHeadId?: string | null } | null>(null);
 useUnsavedWarning(Boolean(content) || busy || uncertain);
 const locked = busy || uncertain || aiBusy || pending;
 function leave() { if (locked) return; if (content && !window.confirm('아직 등록하지 않은 답변을 지우고 닫을까요?')) return; close(); }
 async function write(action: 'answer' | 'resolve') {
  if (gate.current || stale || !state.data || !state.data.canAnswer) return;
  if (!retry.current) { if (action === 'answer' && !content.trim()) return; retry.current = { action, questionId, ...(action === 'answer' ? { content, requestId: crypto.randomUUID(), expectedHeadId: state.data.question.headId } : {}) }; }
  gate.current = true; setBusy(true); setNotice('');
  try {
   const sent = retry.current, result = await request<{ id: string; questionId?: string; resolved?: boolean }>(questionId, sent);
   if (sent.action === 'answer' ? result.id !== sent.requestId || result.questionId !== questionId : result.id !== questionId || result.resolved !== true) throw new Error('등록 결과를 확인하지 못했습니다.');
   setContent(''); setUncertain(false); retry.current = null; setNotice(action === 'answer' ? '답변을 추가했습니다. 이전 답변도 그대로 남아 있습니다.' : '질문을 처리 완료했습니다.'); state.reload(); changed?.();
  } catch (e) {
   const failure = e as { message: string; status?: number }, unknown = !failure.status || failure.status >= 500; setUncertain(unknown); setStale(failure.status === 409); setNotice(failure.message + (unknown ? ' 같은 요청으로 결과를 다시 확인해 주세요.' : '')); if (!unknown) retry.current = null;
  } finally { gate.current = false; setBusy(false); }
 }
 async function draft() {
  if (locked || content) return; setAiBusy(true); setNotice('');
  try {
   const response = await fetch('/api/admin/questions/answer-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId }), signal: AbortSignal.timeout(30000) });
   const result = await response.json(); if (!response.ok || typeof result.draft !== 'string' || !result.draft.trim()) throw new Error(result.error || 'AI 초안을 확인하지 못했습니다.');
   setContent(result.draft); setNotice('AI 초안입니다. 사실을 확인하고 수정한 뒤 답변을 등록해 주세요.');
  } catch (e) { setNotice((e as Error).message); } finally { setAiBusy(false); }
 }
 return <AdminDrawer title="질문 답변" onClose={leave}>
  <div className="admin-dialog-body">
   {state.data && <><h3>{state.data.question.title}</h3>{state.data.question.learningContext && <p className="meta">{state.data.question.learningContext}</p>}<p className="reading-copy">{state.data.question.content}</p>{state.data.question.archived && <p className="notice">보관된 질문입니다. 답변 이력만 확인할 수 있습니다.</p>}</>}
   <Answers state={state}/>
   {state.data?.canAnswer && <section className="mt24"><h3>답변 추가</h3><p>이전 답변은 남겨 두고 새 답변을 추가합니다.</p><label className="field">새 답변<textarea rows={7} maxLength={10000} value={content} disabled={locked || stale} onChange={e => setContent(e.target.value)}/></label>
    <div className="row mt16"><button type="button" className="btn" disabled={locked || stale || Boolean(content)} onClick={() => void draft()}>{aiBusy ? 'AI 초안 생성 중…' : 'AI 답변 초안'}</button><button type="button" className="btn primary" disabled={locked || stale || !content.trim()} onClick={() => void write('answer')}>답변 추가하기</button></div>
    {!state.data.question.resolved && !state.data.answers.length && <button type="button" className="btn small mt16" disabled={locked || stale || Boolean(content)} onClick={() => void write('resolve')}>답변 없이 처리 완료</button>}
   </section>}
   {notice && <p role="status" className="notice mt16">{notice}</p>}
   {uncertain && <button type="button" className="btn" disabled={busy} onClick={() => void write(retry.current!.action)}>같은 요청 결과 확인</button>}
   {!uncertain && <button type="button" className="btn small mt16" disabled={locked} onClick={() => { state.reload(); setStale(false); }}>최신 답변 확인</button>}
  </div>
  <footer className="admin-dialog-footer">{archive && <button type="button" className="btn" disabled={locked || Boolean(content)} onClick={archive}>보관·숨김</button>}<button type="button" className="btn" disabled={locked} onClick={leave}>닫기</button></footer>
 </AdminDrawer>;
}
