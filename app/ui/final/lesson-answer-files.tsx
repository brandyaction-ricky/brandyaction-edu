"use client";
/* eslint-disable @next/next/no-img-element -- Private answer images use an authenticated, short-lived redirect. */
import { useEffect, useRef, useState } from 'react';
import { ongoingReviewFileUrl } from '@/lib/ongoing-lessons';
import { answerFileSpec, type AnswerFileContext } from '@/lib/lesson-files';
import type { BlockAnswer, PublicLessonBlock } from '@/lib/lesson-blocks';
const endpoint = '/api/platform/lesson-files';
async function post(body: unknown, signal: AbortSignal) {
  const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || '첨부파일을 처리하지 못했습니다.'), { code: data.code }); return data;
}
export function AnswerFiles({ block, answer, onChange, readOnly, context, submissionId, onPending, onRefresh, onDownloadAnswers }: {
  block: PublicLessonBlock; answer?: BlockAnswer; onChange: (value: BlockAnswer) => void; readOnly: boolean;
  context?: AnswerFileContext; submissionId?: string; onPending?: (blockId: string, pending: boolean) => void;
  onRefresh?: () => void; onDownloadAnswers?: () => void;
}) {
  const files = typeof answer === 'object' && answer ? answer : {};
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [canRetry, setCanRetry] = useState(false);
  const [conflict, setConflict] = useState('');
  const retry = useRef<{ file: File; kind: 'image' | 'file'; requestId: string } | null>(null), active = useRef<AbortController | null>(null);
  const latest = useRef({ files, onChange, onPending });
  useEffect(() => { latest.current = { files, onChange, onPending }; });
  useEffect(() => () => { active.current?.abort(); latest.current.onPending?.(block.id, false); }, [block.id]);
  async function upload(file?: File, kind?: 'image' | 'file') {
    if (active.current || readOnly || !context || conflict) return;
    if (file && kind) { retry.current = null; setCanRetry(false); try { answerFileSpec(file.name, file.size, kind); } catch (e) { setError((e as Error).message); return; } retry.current = { file, kind, requestId: crypto.randomUUID() }; setCanRetry(true); }
    const attempt = retry.current; if (!attempt) return;
    const abort = new AbortController(); active.current = abort; setPending(true); setError(''); latest.current.onPending?.(block.id, true);
    try {
      const prepared = await post({ action: 'prepare', ...context, blockId: block.id, name: attempt.file.name, size: attempt.file.size, kind: attempt.kind, requestId: attempt.requestId }, abort.signal);
      if (prepared.id !== attempt.requestId) throw new Error('파일 저장 결과를 확인하지 못했습니다.');
      if (!prepared.ready) {
        // The signed upload grant permits this new path only; no cookies or
        // application auth headers go to Storage. A lost upload response may
        // still have stored the file, so completion verifies it in either case.
        try { await fetch(prepared.signedUrl, { method: 'PUT', body: attempt.file, signal: abort.signal, credentials: 'omit', headers: { 'Content-Type': prepared.contentType, 'x-upsert': 'false', 'Cache-Control': 'max-age=0' } }); } catch { if (abort.signal.aborted) return; }
      }
      const completed = prepared.ready ? prepared : await post({ action: 'complete', fileId: prepared.id }, abort.signal);
      if (completed.id !== attempt.requestId || completed.kind !== attempt.kind) throw new Error('파일 저장 결과를 확인하지 못했습니다.');
      if (!abort.signal.aborted) { latest.current.onChange({ ...latest.current.files, [attempt.kind === 'image' ? 'imageId' : 'fileId']: completed.id }); retry.current = null; setCanRetry(false); }
    } catch (e) { if (!abort.signal.aborted) {
      const failure = e as Error & { code?: string };
      setError(failure.message || '첨부하지 못했습니다. 다시 시도해 주세요.');
      if (failure.code === 'BLOCK_CONTENT_CHANGED' || failure.code === 'BLOCK_ALREADY_SUBMITTED') { setConflict(failure.code); setCanRetry(false); }
    } }
    finally { if (active.current === abort) active.current = null; if (!abort.signal.aborted) { setPending(false); latest.current.onPending?.(block.id, false); } }
  }
  function remove(key: string) { if (!window.confirm('현재 답변에서 첨부를 뺄까요? 이전 제출물의 첨부는 보관됩니다.')) return; const next = { ...latest.current.files }; delete next[key]; onChange(next); }
  function url(file: string, download = false) { if (context?.ongoingReview) return ongoingReviewFileUrl(context.lessonId, context.enrollmentId, context.ongoingReview, file, 'answer') + (download ? '&download=1' : ''); return endpoint + '?' + new URLSearchParams({ file, ...(submissionId ? { submission: submissionId } : {}), ...(download ? { download: '1' } : {}) }); }
  return <section className="lb-field lb-card" aria-label={block.question?.label}>
    <strong>{block.question?.label}</strong>
    {(['image', 'file'] as const).map(kind => {
      const key = kind === 'image' ? 'imageId' : 'fileId', fileId = typeof files[key] === 'string' ? files[key] as string : '';
      const acceptsUpload = block.question?.kind === kind;
      // Older image answers may also contain an archive. Keep its download
      // available without offering a second upload field for new answers.
      if (!acceptsUpload && !fileId) return null;
      return <div key={kind}>
        {fileId && <>{kind === 'image' && <img src={url(fileId)} alt="제출할 답변 이미지" loading="lazy" />}<a className="link" href={url(fileId, true)} target="_blank" rel="noopener noreferrer">{kind === 'image' ? '첨부 이미지 열기' : '압축파일 다운로드'}</a>{!readOnly && <button type="button" className="btn small" disabled={pending} onClick={() => remove(key)}>{kind === 'image' ? '이미지 빼기' : '압축파일 빼기'}</button>}</>}
        {!readOnly && acceptsUpload && <label className="lb-field">{kind === 'image' ? '답변 이미지 선택' : '압축파일 선택'}<input type="file" disabled={pending || !context || Boolean(conflict)} accept={kind === 'image' ? '.png,.jpg,.jpeg,.webp,.gif' : '.zip,.rar,.7z,.tar,.gz,.tgz'} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, kind); }} /></label>}
      </div>;
    })}
    {!readOnly && <small>파일당 최대 10MB. 업로드가 끝나면 답변에 자동저장됩니다.</small>}
    {pending && <p role="status">첨부파일을 올리고 확인하고 있습니다.</p>}
    {error && <div role="alert"><p>{error}</p>{conflict && <><p>선택한 원본 파일은 기기에 그대로 있습니다. 최신 화면에서 다시 첨부해 주세요.</p>{onDownloadAnswers && <button type="button" className="btn small" onClick={onDownloadAnswers}>현재 답변 내려받기</button>}{onRefresh && <button type="button" className="btn small" onClick={onRefresh}>{conflict === 'BLOCK_CONTENT_CHANGED' ? '최신 수업 다시 열기' : '최신 답변 상태 확인'}</button>}</>}{canRetry && <button type="button" className="btn small" disabled={pending} onClick={() => void upload()}>첨부 다시 시도</button>}</div>}
    {readOnly && !Object.keys(files).length && <p>첨부한 파일이 없습니다.</p>}
  </section>;
}
