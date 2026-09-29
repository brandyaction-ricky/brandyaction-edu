"use client";
import { useEffect, useRef, useState } from 'react';
import { lessonMediaSpec, lessonMediaTypes, lessonMediaUrl, type LessonMediaKind } from '@/lib/lesson-media';
import { uploadLessonMedia } from '@/lib/lesson-media-upload';

export function LessonMediaUpload({ courseId, kind, assetId, disabled, onReady, onPending }: {
  courseId?: string; kind: LessonMediaKind; assetId?: string; disabled: boolean;
  onReady: (id: string) => void; onPending: (pending: boolean) => void;
}) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [retry, setRetry] = useState(false);
  const upload = useRef<{ file: File; requestId: string; courseId: string } | null>(null), active = useRef(false), mounted = useRef(true);
  const latest = useRef({ onReady, onPending });
  useEffect(() => { latest.current = { onReady, onPending }; });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (active.current) latest.current.onPending(false); }; }, []);
  async function run() {
    if (active.current || disabled || !upload.current) return;
    const selected = upload.current;
    active.current = true; setPending(true); setRetry(false); setMessage('파일을 올리고 확인하고 있습니다.'); latest.current.onPending(true);
    try {
      const id = await uploadLessonMedia(selected.file, kind, selected.courseId, selected.requestId);
      if (mounted.current) { latest.current.onReady(id); setMessage('파일을 연결했습니다. 학습 저장을 누르면 반영됩니다.'); upload.current = null; }
    } catch (error) { if (mounted.current) { setMessage((error as Error).message + (assetId ? ' 기존 자료는 바뀌지 않았습니다.' : '')); setRetry(true); } }
    finally { active.current = false; if (mounted.current) { setPending(false); latest.current.onPending(false); } }
  }
  function select(file?: File) {
    if (!file || disabled || active.current) return;
    if (!courseId) { setMessage('먼저 기본 정보에서 주차를 선택해 주세요.'); return; }
    try { lessonMediaSpec(file.name, file.size, kind); }
    catch (error) { setMessage((error as Error).message); return; }
    upload.current = { file, requestId: crypto.randomUUID(), courseId }; void run();
  }
  const label = kind === 'image' ? '이미지' : kind === 'audio' ? '음성' : '영상';
  return <div className="lba-media-upload" onPaste={event => {
    if (kind !== 'image' || disabled || active.current) return;
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
    if (files.length) { event.preventDefault(); if (files.length > 1) setMessage('이미지는 한 번에 한 장씩 붙여 넣어 주세요.'); else select(files[0]); }
  }} tabIndex={kind === 'image' ? 0 : undefined} aria-label={`${label} 파일 등록`}>
    <label className="lb-field"><span>{label} 파일 선택</span><input type="file" aria-label={`${label} 파일 선택`} disabled={disabled || pending || !courseId} accept={Object.entries(lessonMediaTypes).filter(([, value]) => value.kind === kind).map(([ext]) => '.' + ext).join(',')} onChange={event => { select(event.target.files?.[0]); event.target.value = ''; }} /></label>
    <p className="meta">{kind === 'image' ? '10MB 이하 · 이 영역을 클릭한 뒤 복사한 이미지를 붙여 넣을 수도 있습니다.' : '50MB 이하 · 큰 파일은 영상 서비스에 올린 뒤 주소로 연결해 주세요.'} {!courseId && '먼저 주차를 선택해 주세요.'}</p>
    {assetId && <a href={lessonMediaUrl(assetId)} target="_blank" rel="noopener noreferrer">연결된 {label} 열기</a>}
    {message && <p role={retry ? 'alert' : 'status'}>{message}</p>}
    {retry && <button type="button" className="btn small" disabled={disabled || pending} onClick={() => { if (upload.current?.courseId !== courseId) { upload.current = null; setRetry(false); setMessage('주차가 바뀌었습니다. 파일을 다시 선택해 주세요.'); } else void run(); }}>같은 파일 다시 올리기</button>}
  </div>;
}
