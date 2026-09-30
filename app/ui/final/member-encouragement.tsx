'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { encouragementInput, readEncouragement, readEncouragementPage, type Encouragement, type PublicEncouragement } from '@/lib/member-encouragement';
import { useUnsavedWarning } from '@/features/admin-ui/components/use-unsaved-warning';
import './member-encouragement.css';

const endpoint = '/api/platform/encouragement';
const changedEvent = 'edu-encouragement-changed';
async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '응원 메시지를 처리하지 못했습니다.');
  return data;
}
export function EncouragementEditor() {
  const [stored, setStored] = useState<Encouragement | null>(null), [publicName, setPublicName] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const pending = useRef<{ publicName: string; message: string; expectedRevision: string | null; requestId: string } | null>(null);
  const inFlight = useRef(false);
  const dirty = stored !== null && (message.trim() !== stored.message || publicName.trim() !== stored.publicName);
  useUnsavedWarning(dirty || busy);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    void fetch(endpoint + '?mine=true', { cache: 'no-store', signal: controller.signal }).then(responseData).then(readEncouragement)
      .then(value => { if (!controller.signal.aborted) { setStored(value); setPublicName(value.publicName); setMessage(value.message); } })
      .catch(cause => { if (!disposed) setError(controller.signal.aborted ? '조회 시간이 초과됐습니다. 다시 불러와 주세요.' : cause.message); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, []);
  async function reload() {
    if (inFlight.current || (dirty && !window.confirm('작성 중인 응원 메시지를 버리고 저장된 메시지를 불러올까요?'))) return;
    inFlight.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const value = readEncouragement(await responseData(await fetch(endpoint + '?mine=true', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })));
      setStored(value); setPublicName(value.publicName); setMessage(value.message); pending.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '응원 메시지를 불러오지 못했습니다.'); } finally { inFlight.current = false; setBusy(false); }
  }
  async function save() {
    if (!stored || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const content = encouragementInput(publicName, message);
      const packet = pending.current?.message === content.message && pending.current.publicName === content.publicName ? pending.current : { ...content, expectedRevision: stored.revision, requestId: crypto.randomUUID() };
      pending.current = packet;
      const value = readEncouragement(await responseData(await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal: AbortSignal.timeout(10_000) })));
      setStored(value); setPublicName(value.publicName); setMessage(value.message); pending.current = null;
      setStatus(value.message ? '응원 메시지를 공개했습니다.' : '응원 메시지 공개를 해제했습니다.'); window.dispatchEvent(new Event(changedEvent));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '응원 메시지를 저장하지 못했습니다.'); } finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="panel pad encouragement-editor" id="encouragement" aria-label="내 응원 메시지">
    <h2>내 응원 메시지</h2><p className="meta">공개 별명과 응원 메시지는 사이트의 다른 방문자도 볼 수 있습니다. 이름·이메일·전화번호 대신 사용할 별명을 직접 정해 주세요. 메시지를 비우고 저장하면 공개가 해제됩니다.</p>
    <label className="field"><span>공개 별명</span><input maxLength={40} value={publicName} disabled={!stored || busy} onChange={event => { setPublicName(event.target.value); setStatus(''); }}/></label>
    <label className="field"><span>응원 메시지</span><textarea rows={3} maxLength={80} value={message} disabled={!stored || busy} onChange={event => { setMessage(event.target.value); setStatus(''); }}/></label>
    <p className="meta">{message.length}/80자 · 저장하면 공개됩니다.</p>
    {message.trim() && <blockquote className="encouragement-preview"><p>{message.trim()}</p><footer>— {publicName.trim() || '공개 별명을 입력해 주세요'}</footer></blockquote>}
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}{!stored && !error && <p role="status">내 응원 메시지를 불러오는 중입니다.</p>}
    <div className="encouragement-actions"><button type="button" className="btn primary" disabled={!stored || busy || !dirty} onClick={() => void save()}>{busy ? '처리 중…' : '응원 메시지 저장'}</button><button type="button" className="btn" disabled={busy || (!stored && !error)} onClick={() => void reload()}>저장된 메시지 다시 불러오기</button></div>
  </section>;
}
export function EncouragementWall() {
  const [rows, setRows] = useState<PublicEncouragement[]>([]), [index, setIndex] = useState(0), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [paused, setPaused] = useState(true), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false), [visible, setVisible] = useState(true);
  const controller = useRef<AbortController | null>(null), sequence = useRef(0), busy = useRef(false);
  function cancelPending() { sequence.current += 1; controller.current?.abort(); }
  async function load(after: string | null = null) {
    if (after && busy.current) return;
    const seq = ++sequence.current; controller.current?.abort();
    const abort = new AbortController(); controller.current = abort; busy.current = true; setLoading(true); setError('');
    const timer = setTimeout(() => abort.abort(), 10_000);
    try {
      const page = readEncouragementPage(await responseData(await fetch(endpoint + (after ? '?cursor=' + encodeURIComponent(after) : ''), { cache: 'no-store', signal: abort.signal })));
      if (seq !== sequence.current || abort.signal.aborted) return;
      setRows(previous => after ? [...previous, ...page.rows.filter(row => !previous.some(item => item.id === row.id))] : page.rows);
      if (!after) setIndex(0);
      setCursor(page.nextCursor);
    } catch (cause) { if (seq === sequence.current) setError(abort.signal.aborted ? '응원 메시지 조회 시간이 초과됐습니다.' : cause instanceof Error ? cause.message : '응원 메시지를 불러오지 못했습니다.'); }
    finally { clearTimeout(timer); if (seq === sequence.current) { busy.current = false; setLoading(false); } }
  }
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => setPaused(motion.matches);
    motionChanged(); motion.addEventListener('change', motionChanged);
    const refresh = () => void load();
    const visibility = () => setVisible(document.visibilityState === 'visible');
    visibility(); refresh(); window.addEventListener(changedEvent, refresh); document.addEventListener('visibilitychange', visibility);
    return () => { cancelPending(); motion.removeEventListener('change', motionChanged); window.removeEventListener(changedEvent, refresh); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (paused || hovered || focused || !visible || rows.length < 2) return;
    const timer = setInterval(() => setIndex(previous => (previous + 1) % rows.length), 5000);
    return () => clearInterval(timer);
  }, [paused, hovered, focused, visible, rows.length]);
  const current = rows[index];
  return <section className="panel pad encouragement-wall" aria-label="참가자 응원 메시지" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div className="encouragement-heading"><h2><HeartHandshake size={20} aria-hidden="true"/>참가자 응원 메시지</h2><Link href="/my/profile#encouragement">내 응원 쓰기·수정</Link></div>
    {current ? <blockquote aria-live={paused || focused ? 'polite' : 'off'} aria-atomic="true"><p>{current.message}</p><footer>— {current.publicName}</footer></blockquote> : !loading && !error ? <p className="meta">첫 응원 메시지를 남겨 보세요.</p> : null}
    {rows.length > 1 && <div className="encouragement-actions"><button type="button" className="btn small" aria-label="이전 응원" onClick={() => { setPaused(true); setIndex((index + rows.length - 1) % rows.length); }}>이전</button><span className="meta">{index + 1} / {rows.length}</span><button type="button" className="btn small" aria-label="다음 응원" onClick={() => { setPaused(true); setIndex((index + 1) % rows.length); }}>다음</button><button type="button" className="btn small" onClick={() => setPaused(!paused)}>{paused ? '자동 넘김 시작' : '자동 넘김 정지'}</button></div>}
    {cursor && <button type="button" className="btn small" disabled={loading} onClick={() => void load(cursor)}>응원 더 불러오기</button>}
    {loading && <p className="meta" role="status">응원 메시지를 불러오는 중입니다.</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="btn small" disabled={loading} onClick={() => void load()}>응원 다시 불러오기</button></div>}
  </section>;
}
