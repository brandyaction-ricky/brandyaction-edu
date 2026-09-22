'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Row } from '@/lib/platform';

type QuestionPage = { rows: Row[]; page: number; pageSize: number; total: number };

export function MissionDiscussion({ missionId, enrollmentId }: { missionId: string; enrollmentId: string }) {
  const [page, setPage] = useState(1), [revision, refresh] = useState(0);
  const [state, setState] = useState<{ key: string; data?: QuestionPage; error?: string }>({ key: '' });
  const [title, setTitle] = useState(''), [content, setContent] = useState('');
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const intent = useRef<{ value: string; id: string } | null>(null), inFlight = useRef(false);
  const key = `${enrollmentId}:${missionId}:${page}:${revision}`;
  const current = state.key === key ? state : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/mission/questions?' + new URLSearchParams({ enrollment: enrollmentId, mission: missionId, page: String(page) }), { cache: 'no-store', signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error || '질문을 불러오지 못했습니다.'); if (!controller.signal.aborted) setState({ key, data: result }); })
      .catch(cause => { if (!controller.signal.aborted) setState({ key, error: cause.message }); });
    return () => controller.abort();
  }, [enrollmentId, missionId, page, key]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(''); setMessage('');
    const value = JSON.stringify([missionId, enrollmentId, title.trim(), content.trim()]);
    if (intent.current?.value !== value) intent.current = { value, id: crypto.randomUUID() };
    try {
      const response = await fetch('/api/mission/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId, enrollmentId, title, content, requestId: intent.current.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '질문을 저장하지 못했습니다.');
      intent.current = null; setTitle(''); setContent(''); setPage(1); refresh(v => v + 1); setMessage('질문을 접수했습니다. 운영자 답변은 이곳과 내 질문에서 확인할 수 있습니다.');
    } catch (cause) { setError((cause as Error).message); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section className="panel pad mt24" aria-label="이 미션 질문·답변">
    <div className="between"><h3>이 미션 질문·답변</h3><button className="btn small" onClick={() => refresh(v => v + 1)} disabled={pending}>답변 새로고침</button></div>
    <p className="meta">내 질문과 운영자 답변만 표시됩니다. 제출 답변·검토 피드백과 별도로 관리됩니다.</p>
    {!current && <p role="status">질문을 불러오는 중입니다.</p>}
    {current?.error && <p role="alert">{current.error} 입력한 내용은 유지됩니다.</p>}
    {current?.data?.rows.map(question => <article className="question-card" key={question.id}><span className="badge">{question.status === 'answered' ? '답변 완료' : '답변 대기'}</span><h4>{String(question.title)}</h4><p className="reading-copy">{String(question.content)}</p>{question.answer ? <div className="answer"><b>운영자 답변</b><p className="reading-copy">{String(question.answer)}</p></div> : <p className="meta">답변을 기다리고 있습니다.</p>}</article>)}
    {current?.data && !current.data.rows.length && <p>아직 이 미션에 남긴 질문이 없습니다.</p>}
    {current?.data && current.data.total > 20 && <nav aria-label="미션 질문 페이지"><button className="btn" disabled={page === 1 || pending} onClick={() => setPage(v => v - 1)}>이전 질문</button><span>{page} / {Math.ceil(current.data.total / 20)}</span><button className="btn" disabled={page * 20 >= current.data.total || pending} onClick={() => setPage(v => v + 1)}>다음 질문</button></nav>}
    <form onSubmit={submit} className="mt24"><fieldset disabled={pending || !current?.data} className="workflow-fieldset"><label className="field">미션 질문 제목<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200}/></label><label className="field">미션 질문 내용<textarea value={content} onChange={e => setContent(e.target.value)} rows={4} required maxLength={10000}/></label><button className="btn" disabled={!title.trim() || !content.trim()}>{pending ? '질문 등록 중…' : '미션 질문 등록'}</button></fieldset>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}</form>
  </section>;
}
