'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { date, type Row } from '@/lib/platform';
import { QuestionComposer, questionRequest, RelatedAnswers } from './question-composer';
import { QuestionImage } from './question-image';
import { QuestionAnswerHistory } from './question-thread';
import { Heading } from './primitives';
import { AnswerText } from './lesson-text';

export function QuestionCard({ question: q, initiallyOpen = false, changed }: { question: Row; initiallyOpen?: boolean; changed?: () => void }) {
  return <article className="question-card" id={'question-' + q.id}>
    <div className="between"><b>{q.is_resolved ? '질문 종료' : q.status === 'answered' ? '답변 있음' : '답변 대기'}</b><span className="meta">{date(q.created_at)}</span></div>
    <h3>{String(q.title)}</h3>{Boolean(q.learning_context) && <p className="meta">{String(q.learning_context)}</p>}
    <p className="reading-copy">{String(q.content)}</p><QuestionImage questionId={String(q.id)} imageId={q.image_id}/>
    <p className="meta">{q.visibility === 'cohort' ? '전체 공개 · 같은 기수 수강생이 함께 봐요' : '비밀 질문 · 나와 담당 운영자만 볼 수 있어요'}</p>
    {process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED === 'true' ? <QuestionAnswerHistory questionId={String(q.id)} initiallyOpen={initiallyOpen} readOnly={q.mine === false} fallback={String(q.answer || '')} onResolved={changed} onStatusChange={status => { if (status !== q.status) changed?.(); }}/> : Boolean(q.answer) && <p className="answer reading-copy"><AnswerText text={String(q.answer)}/></p>}
  </article>;
}
export function QuestionHub({ order }: { order?: string | null }) {
  const params = useSearchParams(), [showAll, setShowAll] = useState(false);
  const candidate = params.get('question'), target = !showAll && candidate && /^[a-f0-9-]{36}$/.test(candidate) ? candidate : null;
  const [tab, setTab] = useState<'write' | 'mine' | 'public'>(order ? 'write' : target ? 'mine' : 'public');
  const [page, setPage] = useState(0), [version, setVersion] = useState(0), [query, setQuery] = useState('');
  const [notice, setNotice] = useState(''), [filter, setFilter] = useState('전체');
  const [state, setState] = useState<{ key: string; questions?: Row[]; hasMore?: boolean; error?: string }>();
  const key = JSON.stringify([tab, page, version, query, target]);
  useEffect(() => {
    if (tab === 'write') return;
    const abort = new AbortController(); let alive = true;
    const timer = setTimeout(() => void questionRequest<{ questions: Row[]; hasMore: boolean }>('/api/platform/question-hub?' + new URLSearchParams({ mode: tab, page: String(page), ...(tab === 'public' ? { q: query } : target ? { question: target } : {}) }), undefined, abort.signal).then(data => { if (alive) setState({ key, ...data }); }).catch(e => { if (alive) setState({ key, error: e.message }); }), tab === 'public' ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); abort.abort(); };
  }, [key, tab, page, query, target]);
  function select(next: typeof tab) { setTab(next); setPage(0); setFilter('전체'); }
  const data = state?.key === key ? state : undefined;
  const questions = (data?.questions || []).filter(q => filter === '전체' || (q.is_resolved ? '질문 종료' : q.status === 'answered' ? '답변 있음' : '답변 대기') === filter);
  return <>
    <Heading title="질문·답변" description="궁금한 점을 남기고, 같은 기수 수강생의 질문과 답변도 함께 확인하세요."/>
    <div className="question-hub-tabs" role="tablist" aria-label="질문 메뉴">{([['public','전체 질문'],['mine','내 질문'],['write','질문하기']] as const).map(([value,label]) => <button type="button" key={value} role="tab" aria-selected={tab === value} onClick={() => select(value)}>{label}</button>)}</div>
    {notice && <p role="status" className="notice mb24">{notice}</p>}
    <div hidden={tab !== 'write'} className="panel pad mb24"><QuestionComposer order={order} onCreated={() => { setNotice('질문을 등록했습니다. 답변은 이곳에서 확인할 수 있어요.'); setVersion(v => v + 1); select('mine'); }}/></div>
    {target && tab === 'mine' && <button className="btn small mb24" onClick={()=>setShowAll(true)}>내 질문 전체 보기</button>}
    {tab === 'public' && <><p className="meta mb16">같은 기수에 공개한 학습 질문입니다. 비밀 질문은 ‘내 질문’에서 확인하세요.</p><label className="field mb24">질문 검색<input type="search" maxLength={500} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="궁금한 내용을 검색해 보세요"/></label><RelatedAnswers query={query} context={null}/></>}
    {tab !== 'write' && (!data ? <p role="status">불러오고 있습니다.</p> : data.error ? <p role="alert">{data.error} <button className="btn small" onClick={() => setVersion(v => v + 1)}>다시 불러오기</button></p> : <>
      {tab === 'mine' && <div className="chips mb24">{['전체','답변 대기','답변 있음','질문 종료'].map(f => <button className={'chip ' + (filter === f ? 'active' : '')} key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</div>}
      {tab === 'mine' && <p className="meta mb24">‘답변 있음’은 운영자가 답변을 남긴 질문, ‘질문 종료’는 수강생 또는 운영자가 대화를 마친 질문입니다. 종료 후에도 후속 질문을 남길 수 있어요.</p>}
      {questions.map(q => <QuestionCard key={q.id} question={q} initiallyOpen={target === q.id} changed={() => setVersion(v => v + 1)}/>)}
      {!questions.length && <p className="notice">{tab === 'public' ? '아직 공개된 질문이 없어요. 첫 질문을 남겨 보세요.' : filter === '전체' ? '아직 남긴 질문이 없어요. 질문하기에서 편하게 물어보세요.' : '이 페이지에는 해당 상태의 질문이 없습니다.'}</p>}
      {(page > 0 || data.hasMore) && <div className="question-hub-pages"><button className="btn small" disabled={!page} onClick={() => setPage(p => p - 1)}>이전</button><span>{page + 1}페이지</span><button className="btn small" disabled={!data.hasMore} onClick={() => setPage(p => p + 1)}>다음</button></div>}
    </>)}
  </>;
}
