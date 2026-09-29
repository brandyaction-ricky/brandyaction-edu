'use client';
/* eslint-disable @next/next/no-img-element -- private authenticated image endpoint and local object URL */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { answerFileSpec } from '@/lib/lesson-files';
async function post(body: unknown) {
 const response = await fetch('/api/platform/question-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
 const result = await response.json(); if (!response.ok) throw new Error(result.error || '이미지를 올리지 못했습니다. 다시 시도해 주세요.'); return result;
}
export type QuestionImagePickerHandle = { paste: (files: File[]) => void };
export function QuestionImagePicker({ enrollmentId, lessonId, locked, changed, ref }: { enrollmentId: string; lessonId: string; locked: boolean; changed: (id: string | null, busy: boolean, hasDraft: boolean) => void; ref?: Ref<QuestionImagePickerHandle> }) {
 const [selection, setSelection] = useState<{ file: File; request: string; preview: string } | null>(null), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
 const gate = useRef(false), mounted = useRef(false), notify = useRef(changed);
 useEffect(() => { notify.current = changed; }, [changed]);
 useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
 useEffect(() => () => { if (selection) URL.revokeObjectURL(selection.preview); }, [selection]);
 async function upload(next: NonNullable<typeof selection>) {
  if (gate.current || locked) return; gate.current = true; setBusy(true); setReady(false); setError(''); notify.current(null, true, true);
  try {
   const spec = answerFileSpec(next.file.name, next.file.size, 'image');
   const prepared = await post({ action: 'prepare', enrollmentId, lessonId, requestId: next.request, name: spec.name, size: spec.size });
   if (!prepared.ready) {
    // The upload may have succeeded even when its response was lost. Completion
    // verifies the immutable object; retries never overwrite a prior upload.
    try { await fetch(prepared.signedUrl, { method: 'PUT', headers: { 'Content-Type': spec.contentType }, body: next.file, signal: AbortSignal.timeout(60000) }); } catch { /* verify below */ }
    const done = await post({ action: 'complete', fileId: prepared.id });
    if (done.id !== next.request) throw new Error('이미지 등록 결과를 확인하지 못했습니다.');
   } else if (prepared.id !== next.request) throw new Error('이미지 등록 결과를 확인하지 못했습니다.');
   if (mounted.current) { setReady(true); notify.current(next.request, false, true); }
  } catch (e) { if (mounted.current) { setError((e as Error).message); notify.current(null, false, true); } }
  finally { gate.current = false; if (mounted.current) setBusy(false); }
 }
 function choose(file?: File) {
  if (!file || locked || gate.current) return;
  try { answerFileSpec(file.name, file.size, 'image'); } catch (e) { setError((e as Error).message); return; }
  const next = { file, request: crypto.randomUUID(), preview: URL.createObjectURL(file) }; setSelection(next); void upload(next);
 }
 function remove() { if (locked || gate.current) return; setSelection(null); setReady(false); setError(''); notify.current(null, false, false); }
 useImperativeHandle(ref, () => ({ paste(files) {
  if (locked || gate.current || !files.length) return;
  if (files.length !== 1) { setError('질문 이미지는 한 장씩 붙여넣어 주세요.'); return; }
  choose(files[0]);
 } }));
 return <div className="field question-image-picker"><label>질문 이미지 (선택)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={locked || busy} onChange={e => { choose(e.target.files?.[0]); e.target.value = ''; }}/></label><small>JPG·PNG·WEBP·GIF 한 장, 최대 10MB. 복사한 이미지는 질문 입력란에 붙여넣을 수 있습니다. 본인과 담당 운영자만 볼 수 있습니다.</small>
  {selection && <figure><img src={selection.preview} alt="첨부할 질문 이미지" style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain' }}/><figcaption style={{ overflowWrap: 'anywhere' }}>{selection.file.name}</figcaption><div className="row mt16"><button type="button" className="btn small" disabled={locked || busy} onClick={remove}>이미지 빼기</button>{!ready && !busy && <button type="button" className="btn small" disabled={locked} onClick={() => void upload(selection)}>이미지 다시 올리기</button>}</div></figure>}
  {busy && <p role="status">이미지를 올리고 있습니다.</p>}{ready && <p role="status">이미지 준비 완료. 질문을 등록하면 함께 저장됩니다.</p>}{error && <p role="alert" className="form-error">{error}</p>}
 </div>;
}
export function QuestionImage({ questionId, imageId }: { questionId: string; imageId?: unknown }) {
 const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
 if (process.env.NEXT_PUBLIC_EDU_QUESTION_IMAGES_ENABLED !== 'true' || !imageId) return null;
 const src = '/api/platform/question-images?' + new URLSearchParams({ question: questionId, attempt: String(attempt) });
 return <figure className="mt16" style={{ marginInline: 0 }}>{failed ? <p role="alert">질문 이미지를 불러오지 못했습니다. <button type="button" className="btn small" onClick={() => { setAttempt(v => v + 1); setFailed(false); }}>이미지 다시 보기</button></p> : <><a href={src} target="_blank" rel="noopener noreferrer" aria-label="질문 이미지 크게 보기"><img src={src} alt="질문 첨부 이미지" loading="lazy" onError={() => setFailed(true)} style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}/></a><figcaption className="meta">이미지를 누르면 크게 볼 수 있습니다.</figcaption></>}</figure>;
}
