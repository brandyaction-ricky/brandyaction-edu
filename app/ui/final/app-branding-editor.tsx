'use client';
/* eslint-disable @next/next/no-img-element -- Local upload previews and prebuilt small icon assets. */
import { useEffect, useRef, useState } from 'react';
import { defaultBranding, publicAppBranding, validateIconFile, type PublicAppBranding } from '@/lib/app-branding';
import { useUnsavedWarning } from '@/features/admin-ui/components/use-unsaved-warning';
import './app-branding-editor.css';

const endpoint = '/api/admin/app-branding';
export function AppBrandingEditor() {
  const [stored, setStored] = useState<PublicAppBranding | null>(null), [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(''), [reset, setReset] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  const blob = useRef(''), pending = useRef<{ id: string; expected: string | null } | null>(null), saving = useRef(false), input = useRef<HTMLInputElement>(null);
  const dirty = Boolean(file || reset);
  useUnsavedWarning(dirty || busy);
  useEffect(() => {
    let disposed = false; const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10_000);
    void fetch(endpoint, { cache: 'no-store', signal: abort.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw Error(data.error || '아이콘을 불러오지 못했습니다.'); return data;
    }).then(data => { if (!disposed) setStored(data); }).catch(e => { if (!disposed) setError(abort.signal.aborted ? '조회 시간이 초과됐습니다. 다시 불러와 주세요.' : e.message); }).finally(() => clearTimeout(timer));
    return () => { disposed = true; abort.abort(); clearTimeout(timer); if (blob.current) URL.revokeObjectURL(blob.current); };
  }, []);
  function clearDraft(resetInput = true) {
    if (blob.current) URL.revokeObjectURL(blob.current); blob.current = ''; setPreview(''); setFile(null); setReset(false); pending.current = null;
    if (resetInput && input.current) input.current.value = '';
  }
  function choose(next: File | undefined) {
    if (!next) return;
    setError(''); setStatus('');
    try { validateIconFile(next); } catch (e) { clearDraft(); setError((e as Error).message); return; }
    clearDraft(false); blob.current = URL.createObjectURL(next); setFile(next); setPreview(blob.current);
  }
  async function reload() {
    if (dirty && !window.confirm('선택한 이미지를 취소하고 저장된 아이콘을 불러올까요?')) return;
    if (saving.current) return; saving.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(10_000) }), data = await response.json();
      if (!response.ok) throw Error(data.error || '아이콘을 불러오지 못했습니다.'); setStored(data); clearDraft();
    } catch (e) { setError(e instanceof Error ? e.message : '아이콘을 불러오지 못했습니다.'); }
    finally { saving.current = false; setBusy(false); }
  }
  async function save() {
    if (!stored || !dirty || saving.current) return;
    saving.current = true; setBusy(true); setError(''); setStatus('');
    try {
      const packet = pending.current || { id: crypto.randomUUID(), expected: stored.revision }; pending.current = packet;
      const body = new FormData(); body.set('action', reset ? 'reset' : 'replace'); body.set('requestId', packet.id); body.set('expectedRevision', packet.expected || '');
      if (file) body.set('file', file);
      const response = await fetch(endpoint, { method: 'POST', body, signal: AbortSignal.timeout(30_000) }), data = await response.json();
      if (!response.ok) throw Error(data.error || '아이콘을 저장하지 못했습니다.');
      setStored(data); clearDraft(); setStatus(data.custom ? '새 앱 아이콘을 저장했습니다.' : '기본 앱 아이콘으로 되돌렸습니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '아이콘을 저장하지 못했습니다.'); }
    finally { saving.current = false; setBusy(false); }
  }
  const shown = preview || (reset ? publicAppBranding(defaultBranding).icon : stored?.icon);
  return <section className="panel pad app-branding-editor" aria-label="앱 아이콘 설정">
    <h2>앱 아이콘</h2><p className="meta">휴대폰 홈 화면에 추가할 때 보이는 이미지입니다. 관리자만 바꿀 수 있습니다.</p>
    {shown && <div className="app-branding-previews"><figure><img src={shown} alt="사각형 앱 아이콘 미리보기" width={88} height={88}/><figcaption>사각형</figcaption></figure><figure><div className="app-branding-circle"><img src={preview || reset ? shown : stored?.icons[2].src} alt="원형 앱 아이콘 미리보기" width={88} height={88} className={preview ? 'app-branding-inset' : ''}/></div><figcaption>원형 · 여백 자동 조절</figcaption></figure></div>}
    <p className="meta">{dirty ? '미리보기입니다. 아래 저장 버튼을 눌러야 반영됩니다.' : stored?.custom ? '등록한 아이콘을 사용 중입니다.' : '기본 브랜디에듀 아이콘을 사용합니다.'}</p>
    <label className="field"><span className="field-label">새 아이콘 이미지</span><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={!stored || busy} onChange={event => choose(event.target.files?.[0])}/></label>
    <p className="meta">가로·세로가 같은 512~4096px 이미지 · PNG, JPG, WEBP · 최대 2MB. 투명한 부분과 원형 아이콘의 여백은 흰색으로 채워집니다.</p>
    <p className="notice mt16">새로 설치할 때 변경한 아이콘이 적용됩니다. 이미 설치한 휴대폰은 반영까지 시간이 걸리거나 홈 화면에서 삭제한 뒤 다시 추가해야 할 수 있습니다.</p>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}{!stored && !error && <p role="status">아이콘을 불러오는 중입니다.</p>}
    <div className="row wrap-flex mt16"><button type="button" className="btn primary" disabled={!stored || !dirty || busy} onClick={() => void save()}>{busy ? '처리 중…' : '앱 아이콘 저장'}</button><button type="button" className="btn" disabled={!stored || !stored.custom || busy} onClick={() => { clearDraft(); setReset(true); setError(''); setStatus(''); }}>기본 아이콘으로 되돌리기</button>{dirty && <button type="button" className="btn ghost" disabled={busy} onClick={() => { clearDraft(); setError(''); setStatus(''); }}>변경 취소</button>}<button type="button" className="btn ghost" disabled={busy || !stored && !error} onClick={() => void reload()}>저장된 아이콘 다시 불러오기</button></div>
  </section>;
}
