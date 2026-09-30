'use client';
import { Megaphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { noticeMessage, readLearningNotice, type LearningNotice } from '@/lib/learning-notice';
import { useUnsavedWarning } from '@/features/admin-ui/components/use-unsaved-warning';
import './learning-notice.css';

const endpoint = '/api/platform/learning-notice';
const changedEvent = 'edu-learning-notice-changed';
export function LearningNoticeBanner({ message }: { message: string }) {
  return message ? <aside className="learning-notice-banner" aria-label="전체 학습 공지"><Megaphone size={16} aria-hidden="true"/><span>{message}</span></aside> : null;
}
export function LearningNoticeBar() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let controller: AbortController | null = null;
    const refresh = () => {
      controller?.abort(); const current = new AbortController(); controller = current;
      const timeout = setTimeout(() => current.abort(), 10_000);
      void fetch(endpoint, { cache: 'no-store', signal: current.signal })
        .then(async response => { if (!response.ok) throw Error(); return noticeMessage((await response.json()).message); })
        .then(value => { if (!current.signal.aborted) setMessage(value); })
        .catch(() => { /* A notice outage must not block the lesson. */ })
        .finally(() => clearTimeout(timeout));
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh(); window.addEventListener(changedEvent, refresh); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible);
    return () => { controller?.abort(); window.removeEventListener(changedEvent, refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return <LearningNoticeBanner message={message}/>;
}
export function LearningNoticeEditor() {
  const [stored, setStored] = useState<LearningNotice | null>(null), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const pendingRequest = useRef<{ requestId: string; expectedRevision: string | null; message: string } | null>(null);
  const dirty = stored !== null && message.trim() !== stored.message;
  useUnsavedWarning(dirty || busy);
  useEffect(() => {
    let disposed = false;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10_000);
    void fetch(endpoint + '?manage=true', { cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error || '공지를 불러오지 못했습니다.'); return readLearningNotice(data);
    }).then(value => { if (!abort.signal.aborted) { setStored(value); setMessage(value.message); } }).catch(error => { if (!disposed) setError(abort.signal.aborted ? '공지 조회 시간이 초과됐습니다. 다시 불러와 주세요.' : error.message); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; abort.abort(); clearTimeout(timer); };
  }, []);
  async function reload() {
    if (dirty && !window.confirm('작성 중인 문구를 버리고 저장된 공지를 불러올까요?')) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const response = await fetch(endpoint + '?manage=true', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || '공지를 불러오지 못했습니다.');
      const value = readLearningNotice(data); setStored(value); setMessage(value.message); pendingRequest.current = null;
    } catch (error) { setError(error instanceof Error ? error.message : '공지를 불러오지 못했습니다.'); } finally { setBusy(false); }
  }
  async function save() {
    if (!stored || busy) return;
    setBusy(true); setError(''); setStatus('');
    try {
      const normalized = noticeMessage(message);
      const packet = pendingRequest.current?.message === normalized ? pendingRequest.current : { message: normalized, expectedRevision: stored.revision, requestId: crypto.randomUUID() };
      pendingRequest.current = packet;
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal: AbortSignal.timeout(10_000) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || '공지를 저장하지 못했습니다.');
      const value = readLearningNotice(data); setStored(value); setMessage(value.message); pendingRequest.current = null;
      setStatus(value.message ? '공지를 저장했습니다.' : '공지를 숨겼습니다.'); window.dispatchEvent(new Event(changedEvent));
    } catch (error) { setError(error instanceof Error ? error.message : '공지를 저장하지 못했습니다.'); } finally { setBusy(false); }
  }
  return <section className="panel pad learning-notice-editor" aria-label="전체 학습 공지 설정">
    <h2>전체 학습 공지</h2><p className="meta">모든 사용자의 화면 상단에 표시됩니다. 문구를 비우고 저장하면 숨깁니다. 관리자만 변경할 수 있습니다.</p>
    <label className="field"><span className="field-label">공지 문구</span><textarea rows={3} maxLength={200} value={message} disabled={!stored || busy} onChange={event => { setMessage(event.target.value); setStatus(''); }}/></label>
    <p className="meta">{message.length}/200자 · 저장 전에는 학생에게 반영되지 않습니다.</p>
    {message.trim() && <div className="learning-notice-preview"><p className="meta">미리보기</p><LearningNoticeBanner message={message.trim()}/></div>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}
    {!stored && !error && <p role="status">공지를 불러오는 중입니다.</p>}
    <div className="row wrap-flex"><button type="button" className="btn primary" disabled={!stored || busy || !dirty} onClick={() => void save()}>{busy ? '처리 중…' : '공지 저장'}</button><button type="button" className="btn" disabled={busy || (!stored && !error)} onClick={() => void reload()}>저장된 공지 다시 불러오기</button></div>
  </section>;
}
