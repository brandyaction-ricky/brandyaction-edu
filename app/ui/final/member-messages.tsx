"use client";
import { useEffect, useRef, useState } from 'react';
import './member-messages.css';
import { PushSettings } from './push-settings';

type Message = { id: string; senderId: string; recipientId: string; senderName: string | null; recipientName: string | null; content: string; createdAt: string; readAt: string | null };
type Inbox = { rows: Message[]; nextCursor: string | null; unreadCount: number; canSendToMembers: boolean };
type Recipient = { id: string; name: string | null; email: string | null };
type Recipients = { rows: Recipient[]; nextCursor: string | null };
type SendRequest = { action: 'send'; requestId: string; content: string; recipients: string[]; replyTo: string | null; ongoingLesson: string | null };
const endpoint = '/api/member/messages';
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
async function get<T>(query: Record<string, string>, signal: AbortSignal): Promise<T> {
  const response = await fetch(endpoint + '?' + new URLSearchParams(query), { cache: 'no-store', signal });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '메시지를 불러오지 못했습니다.'); return data;
}
async function post(body: object) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '전송 결과를 확인하지 못했습니다.'), { definitive: [400, 401, 403, 404, 409, 413, 429].includes(response.status) });
  return data;
}
export function MemberMessages({ ongoingLesson = '', userId }: { ongoingLesson?: string; userId?: string }) {
  const [view, setView] = useState({ box: 'inbox', before: '', refresh: 0 });
  const key = JSON.stringify(view), [loaded, setLoaded] = useState<{ key: string; data?: Inbox; error?: string }>();
  const data = loaded?.key === key ? loaded.data : undefined;
  const [expanded, setExpanded] = useState(''), [readError, setReadError] = useState('');
  const [readBusy, setReadBusy] = useState(false), readGate = useRef(false);
  const [search, setSearch] = useState(''), [filter, setFilter] = useState({ search: '', after: '', refresh: 0 });
  const recipientKey = JSON.stringify({ ...filter, ongoingLesson });
  const [recipientResult, setRecipientResult] = useState<{ key: string; data?: Recipients; error?: string }>();
  const recipients = recipientResult?.key === recipientKey ? recipientResult.data : undefined;
  const [selected, setSelected] = useState<Recipient[]>([]), [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null), [sendError, setSendError] = useState(''), [notice, setNotice] = useState('');
  const [inFlight, setInFlight] = useState(false), [uncertain, setUncertain] = useState<SendRequest | null>(null), sendGate = useRef(false);
  const frozen = inFlight || !!uncertain;
  const canSendToMembers = data?.canSendToMembers;
  useEffect(() => {
    const abort = new AbortController();
    void get<Inbox>({ box: view.box, ...(view.before ? { before: view.before } : {}) }, abort.signal).then(value => {
      if (!Array.isArray(value.rows) || typeof value.canSendToMembers !== 'boolean' || !Number.isInteger(value.unreadCount)) throw new Error('메시지 목록을 확인하지 못했습니다.');
      if (!abort.signal.aborted) setLoaded({ key, data: value });
    }).catch(e => { if (!abort.signal.aborted) setLoaded({ key, error: e.message }); });
    return () => abort.abort();
  }, [key, view]);
  useEffect(() => {
    if (!canSendToMembers) return;
    const abort = new AbortController();
    void get<Recipients>({ action: 'recipients', search: filter.search, ...(filter.after ? { after: filter.after } : {}), ...(ongoingLesson ? { ongoing: ongoingLesson } : {}) }, abort.signal)
      .then(value => { if (!Array.isArray(value.rows)) throw new Error('회원 목록을 확인하지 못했습니다.'); if (!abort.signal.aborted) setRecipientResult({ key: recipientKey, data: value }); })
      .catch(e => { if (!abort.signal.aborted) setRecipientResult({ key: recipientKey, error: e.message }); });
    return () => abort.abort();
  }, [canSendToMembers, filter, ongoingLesson, recipientKey]);
  useEffect(() => {
    if (!uncertain && !content) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [uncertain, content]);
  function changeBox(box: string) { setExpanded(''); setReadError(''); setView(old => ({ box, before: '', refresh: old.refresh + 1 })); }
  async function open(message: Message) {
    setExpanded(message.id); setReadError('');
    if (message.readAt || view.box !== 'inbox' || readGate.current) return;
    readGate.current = true; setReadBusy(true); const loadedKey = key;
    try {
      const result = await post({ action: 'read', messageId: message.id });
      if (result.id !== message.id || typeof result.readAt !== 'string') throw new Error('읽음 표시를 확인하지 못했습니다.');
      setLoaded(old => old?.key === loadedKey && old.data ? { ...old, data: { ...old.data, unreadCount: Math.max(0, old.data.unreadCount - (old.data.rows.find(row => row.id === message.id)?.readAt ? 0 : 1)), rows: old.data.rows.map(row => row.id === message.id ? { ...row, readAt: result.readAt } : row) } } : old);
    } catch (e) { setReadError((e as Error).message); }
    finally { readGate.current = false; setReadBusy(false); }
  }
  async function send() {
    if (sendGate.current || !data || (!uncertain && !content.trim())) return;
    const request = uncertain || { action: 'send' as const, requestId: crypto.randomUUID(), content, recipients: replyTo ? [] : canSendToMembers ? selected.map(row => row.id).sort() : [], replyTo: replyTo?.id || null, ongoingLesson: !replyTo && canSendToMembers ? ongoingLesson || null : null };
    sendGate.current = true; setInFlight(true); setUncertain(request); setSendError(''); setNotice('');
    try {
      const receipt = await post(request), expected = request.recipients.length || 1;
      if (receipt.requestId !== request.requestId || receipt.count !== expected || !Array.isArray(receipt.messageIds) || receipt.messageIds.length !== expected) throw new Error('전송 결과를 확인하지 못했습니다.');
      setUncertain(null); setContent(''); setSelected([]); setReplyTo(null); setNotice(`${receipt.count}명에게 메시지를 보냈습니다.`); changeBox('sent');
    } catch (e) {
      const error = e as Error & { definitive?: boolean }; if (error.definitive) setUncertain(null); setSendError(error.message);
    } finally { sendGate.current = false; setInFlight(false); }
  }
  return <section className="edu-messages" aria-label="메시지함">
    {userId && process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED === 'true' && <PushSettings key={userId} userId={userId} />}
    <h1>메시지</h1><p>멘토와 학습에 필요한 이야기를 주고받습니다.</p>
    <div className="row"><button className="btn" aria-pressed={view.box === 'inbox'} onClick={() => changeBox('inbox')}>받은 메시지{data ? ` · 안 읽음 ${data.unreadCount}` : ''}</button><button className="btn" aria-pressed={view.box === 'sent'} onClick={() => changeBox('sent')}>보낸 메시지</button><button className="btn" onClick={() => setView(old => ({ ...old, refresh: old.refresh + 1 }))}>메시지 새로고침</button></div>
    {loaded?.key === key && loaded.error ? <p role="alert">{loaded.error}</p> : !data ? <p role="status">메시지를 불러오고 있습니다.</p> : <>
      <p>{view.box === 'sent' ? '내가 보낸 메시지입니다. 받는 사람이 메시지를 열면 읽음으로 표시됩니다.' : '내용 보기를 누르면 읽음으로 표시됩니다.'}</p>
      {!data.rows.length && <p>메시지가 없습니다.</p>}
      {data.rows.map(message => <article className="panel pad" key={message.id}>
        <div className="edu-message-heading"><b>{view.box === 'inbox' ? message.senderName || '회원' : message.recipientName || '회원'}</b><span>{message.readAt ? '읽음' : '안 읽음'} · {time(message.createdAt)}</span></div>
        <button className="btn small" disabled={readBusy} aria-expanded={expanded === message.id} onClick={() => expanded === message.id ? setExpanded('') : void open(message)}>내용 {expanded === message.id ? '접기' : '보기'}</button>
        {expanded === message.id && <><p className="edu-message-body">{message.content}</p>{view.box === 'inbox' && <>
          {readError && <><p role="alert">{readError}</p><button className="btn small" disabled={readBusy} onClick={() => void open(message)}>읽음 표시 다시 확인</button></>}
          <button className="btn small" disabled={frozen || (!!content && replyTo?.id !== message.id)} onClick={() => { setReplyTo(message); setSelected([]); setNotice(''); }}>답장 작성</button>
        </>}</>}
      </article>)}
      <div className="row"><button className="btn small" disabled={!view.before} onClick={() => { setExpanded(''); setView(old => ({ ...old, before: '' })); }}>최신 메시지</button><button className="btn small" disabled={!data.nextCursor} onClick={() => { setExpanded(''); setView(old => ({ ...old, before: data.nextCursor! })); }}>이전 메시지</button></div>
    </>}
    <section className="panel pad mt24" aria-label="메시지 작성">
      <h2>{replyTo ? `${replyTo.senderName || '회원'}에게 답장` : canSendToMembers ? '회원에게 보내기' : '멘토에게 문의하기'}</h2>
      {replyTo && <button className="btn small" disabled={frozen} onClick={() => setReplyTo(null)}>답장 대상 해제</button>}
      {canSendToMembers && !replyTo && <fieldset disabled={frozen}>
        <legend>받는 사람 선택</legend>{ongoingLesson && <p>이 챌린지를 한 번이라도 완료한 회원 중 지금 메시지를 받을 수 있는 회원입니다.</p>}
        <form className="row" onSubmit={e => { e.preventDefault(); setFilter(old => ({ search: search.trim(), after: '', refresh: old.refresh + 1 })); }}>
          <label>이름 또는 이메일<input value={search} maxLength={100} onChange={e => setSearch(e.target.value)} /></label><button className="btn" type="submit">회원 검색</button>
        </form>
        {recipientResult?.key === recipientKey && recipientResult.error ? <p role="alert">{recipientResult.error}</p> : !recipients ? <p role="status">회원 목록을 불러오고 있습니다.</p> : <>
          {!recipients.rows.length && <p>조건에 맞는 회원이 없습니다.</p>}
          <button className="btn small" type="button" disabled={!recipients.rows.length || new Set([...selected.map(row => row.id), ...recipients.rows.map(row => row.id)]).size > 100} onClick={() => setSelected(old => [...old, ...recipients.rows.filter(row => !old.some(item => item.id === row.id))])}>이 페이지 회원 모두 선택</button>
          <div className="edu-message-recipients">{recipients.rows.map(row => <label key={row.id}><input type="checkbox" checked={selected.some(item => item.id === row.id)} disabled={selected.length >= 100 && !selected.some(item => item.id === row.id)} onChange={e => setSelected(old => e.target.checked ? [...old, row] : old.filter(item => item.id !== row.id))} /><span>{row.name || '회원'} · {row.email || '이메일 없음'}</span></label>)}</div>
          <div className="row"><button className="btn small" type="button" disabled={!filter.after} onClick={() => setFilter(old => ({ ...old, after: '' }))}>첫 회원 목록</button><button className="btn small" type="button" disabled={!recipients.nextCursor} onClick={() => setFilter(old => ({ ...old, after: recipients.nextCursor! }))}>다음 회원 목록</button></div>
        </>}
        <p>선택한 회원 {selected.length}명 · 한 번에 최대 100명</p>
        <ul className="edu-message-selected">{selected.map(row => <li key={row.id}>{row.name || '회원'} · {row.email}<button className="btn small" type="button" aria-label={`${row.name || row.email || '회원'} 선택 해제`} onClick={() => setSelected(old => old.filter(item => item.id !== row.id))}>해제</button></li>)}</ul>
      </fieldset>}
      <label>메시지 내용<textarea rows={5} maxLength={5000} value={content} disabled={frozen || !data} onChange={e => { setContent(e.target.value); setNotice(''); }} /></label>
      <p>{content.length}/5,000자</p>{sendError && <p role="alert">{sendError}</p>}
      {uncertain && !inFlight && <p>전송 여부를 확인하는 동안 내용과 받는 사람을 유지합니다. 아래 버튼으로 같은 요청을 다시 확인해 주세요.</p>}
      {notice && <p role="status">{notice}</p>}
      <button className="btn primary" disabled={inFlight || !data || (!uncertain && (!content.trim() || (canSendToMembers && !replyTo && !selected.length)))} onClick={() => void send()}>{inFlight ? '전송 결과 확인 중…' : uncertain ? '전송 결과 다시 확인' : '메시지 보내기'}</button>
    </section>
  </section>;
}
