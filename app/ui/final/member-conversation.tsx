'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminInlineError, AdminLoadingState, AdminEmptyState } from '@/features/admin-ui';
import type { MemberConversationResult, ConversationCursor } from '@/lib/member-conversations';
import './member-conversation.css';
const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
export function MemberConversation({ member }: { member: string }) {
  const [cursors, setCursors] = useState<(ConversationCursor | null)[]>([null]), [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data?: MemberConversationResult; error?: string }>();
  const before = cursors.at(-1) || null, key = JSON.stringify([member, before]);
  useEffect(() => {
    let disposed = false; const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10_000);
    const params = new URLSearchParams({ member }); if (before) params.set('before', JSON.stringify(before));
    void fetch('/api/admin/member-conversation?' + params, { cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error || '대화 기록을 불러오지 못했습니다.');
      if (!disposed && !abort.signal.aborted) setState({ key, data });
    }).catch(cause => { if (!disposed) setState({ key, error: abort.signal.aborted ? '조회 시간이 초과됐습니다. 다시 시도해 주세요.' : cause.message }); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; abort.abort(); clearTimeout(timer); };
  }, [key, member, before, retry]);
  const data = state?.key === key ? state.data : undefined;
  const focus = () => document.activeElement?.closest<HTMLElement>('.member-conversation')?.focus();
  return <section className="member-conversation" aria-label="회원 대화 기록" tabIndex={-1}>
    <h3>회원 대화 기록</h3><p className="meta">회원의 질문·답변과 내 계정이 주고받은 개인 메시지입니다. 최근 기록부터 표시하며, 여기에서 확인해도 메시지의 읽음 표시는 바뀌지 않습니다.</p>
    <div className="row wrap-flex mt16"><button className="btn small" onClick={() => { focus(); setCursors([null]); setRetry(value => value + 1); }}>최신 대화 새로고침</button><Link className="text-link" href="/admin/questions">질문·답변 관리</Link></div>
    {state?.key === key && state.error ? <AdminInlineError onRetry={() => { focus(); setRetry(value => value + 1); }}>{state.error}</AdminInlineError> : !data ? <AdminLoadingState title="대화 기록을 불러오는 중입니다."/> : <>
      {!data.rows.length && <AdminEmptyState title="확인할 대화 기록이 없습니다."/>}
      {data.rows.map(row => <article key={`${row.kind}:${row.id}`} className="panel pad conversation-item">
        <div className="spread wrap-flex"><strong>{row.kind === 'question' ? '회원 질문' : row.kind === 'answer' ? '질문 답변' : row.direction === 'incoming' ? '회원에게 받은 메시지' : '회원에게 보낸 메시지'}</strong><time dateTime={row.at}>{date.format(new Date(row.at))} KST</time></div>
        {row.kind !== 'message' && <h4 className="mt8">{row.title}</h4>}<p className="meta mt8">작성 · {row.author}{row.archived ? ' · 보관된 질문' : ''}</p>
        <p className="conversation-content">{row.content}</p>
        {row.kind === 'message' ? <p className="meta">수신자 {row.readAt ? `읽음 · ${date.format(new Date(row.readAt))} KST` : '아직 읽지 않음'}</p> : <Link className="text-link" href={`/admin/questions?question=${row.question}`}>질문·전체 답변 보기</Link>}
      </article>)}
      <nav aria-label="대화 기록 페이지" className="row wrap-flex mt16"><button className="btn small" disabled={cursors.length === 1} onClick={() => { focus(); setCursors(value => value.slice(0, -1)); }}>이전 기록 페이지</button><span>{cursors.length}페이지</span><button className="btn small" disabled={!data.nextCursor} onClick={() => { if (data.nextCursor) { focus(); setCursors(value => [...value, data.nextCursor]); } }}>이전 대화 더 보기</button></nav>
    </>}
  </section>;
}
