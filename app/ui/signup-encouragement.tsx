'use client';
import { useEffect, useRef, useState } from 'react';
import { encouragementInput, readEncouragement, type Encouragement } from '@/lib/member-encouragement';
import { useUnsavedWarning } from '@/features/admin-ui/components/use-unsaved-warning';

const endpoint = '/api/platform/encouragement';
export function useSignupEncouragement(enabled: boolean) {
  const [selected, setSelected] = useState(false), [stored, setStored] = useState<Encouragement | null>(null);
  const [publicName, setPublicName] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const pending = useRef<{ publicName: string; message: string; expectedRevision: string | null; requestId: string } | null>(null);
  const dirty = enabled && selected && stored !== null && (publicName.trim() !== stored.publicName || message.trim() !== stored.message);
  useUnsavedWarning(dirty);
  useEffect(() => {
    if (!enabled || !selected || stored !== null) return;
    let disposed = false;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10_000);
    void fetch(endpoint + '?mine=true', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error || '응원 메시지를 불러오지 못했습니다.'); return readEncouragement(data);
    }).then(value => {
      if (!controller.signal.aborted) { setStored(value); setPublicName(value.publicName); setMessage(value.message); pending.current = null; setError(''); }
    }).catch(cause => { if (!disposed) setError(controller.signal.aborted ? '응원 메시지 조회 시간이 초과됐습니다.' : cause.message); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [enabled, selected, attempt, stored]);
  function reload() {
    if (dirty && !window.confirm('작성 중인 응원 문구를 버리고 저장된 메시지를 불러올까요?')) return;
    setStored(null); setError(''); setAttempt(value => value + 1);
  }
  // Capture the optional draft before consent writes. The returned operation is
  // called only after both existing consent saves have succeeded.
  function prepare(): () => Promise<void> {
    if (!enabled || !selected) return async () => {};
    if (!stored) throw Error('응원 메시지를 불러온 뒤 다시 시도하거나 선택을 해제하고 가입해 주세요.');
    const content = encouragementInput(publicName, message);
    if (content.publicName === stored.publicName && content.message === stored.message) return async () => {};
    const packet = pending.current?.publicName === content.publicName && pending.current.message === content.message ? pending.current : { ...content, expectedRevision: stored.revision, requestId: crypto.randomUUID() };
    pending.current = packet;
    return async () => {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal: AbortSignal.timeout(10_000) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '응원 메시지를 저장하지 못했습니다. 다시 시도해 주세요.');
      const value = readEncouragement(data); setStored(value); setPublicName(value.publicName); setMessage(value.message); pending.current = null;
    };
  }
  const fields = enabled ? <div className="signup-encouragement mt24">
    <label className="checkline"><input type="checkbox" checked={selected} onChange={event => setSelected(event.target.checked)}/><span>[선택] 참가자들에게 응원 메시지 남기기</span></label>
    {selected && <div className="stack mt16">
      <p className="meta">가입 완료 시 공개 별명과 메시지가 다른 방문자에게도 보입니다. 실명·연락처 대신 별명을 정해 주세요. 회원 정보에서 수정하거나 공개를 해제할 수 있습니다.</p>
      <label className="field"><span>공개 별명</span><input value={publicName} maxLength={40} disabled={!stored} onChange={event => setPublicName(event.target.value)}/></label>
      <label className="field"><span>응원 메시지</span><textarea value={message} maxLength={80} rows={3} disabled={!stored} onChange={event => setMessage(event.target.value)}/></label>
      <p className="meta">{message.length}/80자</p>
      {!stored && !error && <p className="meta" role="status">응원 메시지를 불러오는 중입니다.</p>}
      {error && <p role="alert">{error} 응원 메시지를 선택하지 않고 가입할 수도 있습니다.</p>}
      <button type="button" className="btn small" disabled={!stored && !error} onClick={reload}>저장된 응원 다시 불러오기</button>
    </div>}
  </div> : null;
  return { prepare, fields };
}
