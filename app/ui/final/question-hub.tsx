'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { date, type Row } from '@/lib/platform';
import type { SharedAnswer } from '@/lib/question-hub';
import { QuestionComposer, questionRequest, SharedAnswerCard } from './question-composer';
import { QuestionImage } from './question-image';
import { QuestionAnswerHistory } from './question-thread';
import { Heading } from './primitives';
import { AnswerText } from './lesson-text';

export function QuestionHub({ order }: { order?: string | null }) {
  const [tab, setTab] = useState<'write' | 'mine' | 'shared'>(order ? 'write' : 'mine'), [page, setPage] = useState(0), [version, setVersion] = useState(0), [query, setQuery] = useState('');
  const params = useSearchParams(), [showAll, setShowAll] = useState(false);
  const candidate = params.get('question'), target = !showAll && candidate && /^[a-f0-9-]{36}$/.test(candidate) ? candidate : null;
  const [notice, setNotice] = useState(''), [filter, setFilter] = useState('전체');
  const [state, setState] = useState<{ key: string; questions?: Row[]; answers?: SharedAnswer[]; hasMore?: boolean; error?: string }>();
  const key = JSON.stringify([tab, page, version, query, target]);
  useEffect(() => {
    if (tab === 'write') return;
    const abort = new AbortController(); let alive = true;
    const timer = setTimeout(() => void questionRequest<{ questions?: Row[]; answers?: SharedAnswer[]; hasMore: boolean }>('/api/platform/question-hub?' + new URLSearchParams({ mode: tab, page: String(page), ...(tab === 'shared' ? { q: query } : target ? { question: target } : {}) }), undefined, abort.signal).then(data => { if (alive) setState({ key, ...data }); }).catch(e => { if (alive) setState({ key, error: e.message }); }), tab === 'shared' ? 350 : 0);
    return () => { alive = false; clearTimeout(timer); abort.abort(); };
  }, [key, tab, page, query, target]);
  function select(next: typeof tab) { setTab(next); setPage(0); setFilter('전체'); }
  const data = state?.key === key ? state : undefined;
  const questions = (data?.questions || []).filter(q => filter === '전체' || (q.is_resolved ? '해결 완료' : q.status === 'answered' ? '답변 도착' : '답변 대기') === filter);
  return <>
    <Heading title="질문·답변" description="어디서 질문하든 이곳에서 답변과 추가 질문을 이어갈 수 있어요."/>
    <div className="question-hub-tabs" role="tablist" aria-label="질문 메뉴">{([['write','질문하기'],['mine','내 질문'],['shared','함께 보는 답변']] as const).map(([value,label]) => <button type="button" key={value} role="tab" aria-selected={tab === value} onClick={() => select(value)}>{label}</button>)}</div>
    {notice && <p role="status" className="notice mb24">{notice}</p>}
    {/* Keep the composer mounted while looking up answers; tab changes never lose a draft. */}
    <div hidden={tab !== 'write'} className="panel pad mb24"><QuestionComposer order={order} onCreated={() => { setNotice('질문을 등록했습니다. 답변이 도착하면 알려드릴게요.'); setVersion(v => v + 1); select('mine'); }}/></div>
    {target && tab === 'mine' && <button className="btn small mb24" onClick={()=>setShowAll(true)}>내 질문 전체 보기</button>}
    {tab === 'shared' && <><p className="meta">같은 기수에서 함께 보기로 요청하고 운영자가 확인한 답변입니다.</p><label className="field mb24">답변 검색<input type="search" maxLength={500} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="궁금한 내용을 검색해 보세요"/></label></>}
    {tab !== 'write' && (!data ? <p role="status">불러오고 있습니다.</p> : data.error ? <p role="alert">{data.error} <button className="btn small" onClick={() => setVersion(v => v + 1)}>다시 불러오기</button></p> : <>
      {tab === 'mine' ? <><div className="chips mb24">{['전체','답변 대기','답변 도착','해결 완료'].map(f => <button className={'chip ' + (filter === f ? 'active' : '')} key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>{questions.map(q => <article className="question-card" id={'question-' + q.id} key={q.id}><div className="between"><b>{q.is_resolved ? '해결 완료' : q.status === 'answered' ? '답변 도착' : '답변 대기'}</b><span className="meta">{date(q.created_at)}</span></div><h3>{String(q.title)}</h3>{Boolean(q.learning_context) && <p className="meta">{String(q.learning_context)}</p>}<p className="reading-copy">{String(q.content)}</p><QuestionImage questionId={String(q.id)} imageId={q.image_id}/><p className="meta">{q.sharing_requested ? '운영자 검토 후 답변 공유 요청' : '나와 담당 운영자만 볼 수 있음'}</p>{process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED === 'true' ? <QuestionAnswerHistory questionId={String(q.id)} initiallyOpen={target === q.id} fallback={String(q.answer || '')} onResolved={() => setVersion(v => v + 1)} onStatusChange={status => setState(old => old?.questions?.some(row => row.id === q.id && row.status !== status) ? { ...old, questions: old.questions.map(row => row.id === q.id && row.status !== status ? { ...row, status, is_resolved: status === 'open' ? false : row.is_resolved } : row) } : old)}/> : Boolean(q.answer) && <p className="answer reading-copy"><AnswerText text={String(q.answer)}/></p>}</article>)}{!questions.length && <p className="notice">{filter === '전체' ? '아직 남긴 질문이 없어요. 질문하기에서 편하게 물어보세요.' : '이 페이지에는 해당 상태의 질문이 없습니다.'}</p>}</> : <>{(data.answers || []).map(a => <SharedAnswerCard key={a.id} answer={a}/>)}{!data.answers?.length && <p className="notice">아직 함께 보는 답변이 없어요. 질문하기에서 문의해 주세요.</p>}</>}
      {(page > 0 || data.hasMore) && <div className="question-hub-pages"><button className="btn small" disabled={!page} onClick={() => setPage(p => p - 1)}>이전</button><span>{page + 1}페이지</span><button className="btn small" disabled={!data.hasMore} onClick={() => setPage(p => p + 1)}>다음</button></div>}
    </>)}
  </>;
}
