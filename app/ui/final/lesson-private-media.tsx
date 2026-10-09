"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated media must not use a public image optimizer. */
import { LessonAudio } from './lesson-audio';
import { useRef, useState } from 'react';
import { lessonMediaUrl, type LessonMediaContext, type LessonMediaKind } from '@/lib/lesson-media';
export function LessonPrivateMedia({ assetId, kind, alt, caption, context, submissionId, floatingAudio = false }: { floatingAudio?: boolean; assetId: string; kind: LessonMediaKind; alt?: string; caption?: string; context?: LessonMediaContext; submissionId?: string }) {
  const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const position = useRef(0);
  const url = lessonMediaUrl(assetId, context, submissionId) + '&attempt=' + attempt;
  return <figure>
    {kind === 'image' ? <img key={url} src={url} loading="lazy" alt={alt || ''} onError={() => setFailed(true)} />
      : kind === 'audio' ? <LessonAudio key={url} floating={floatingAudio} src={url} aria-label={alt || '학습 음성'} onTimeUpdate={event => { position.current = event.currentTarget.currentTime; }} onLoadedMetadata={event => { event.currentTarget.currentTime = position.current; }} onError={() => setFailed(true)} />
        : <video key={url} controls playsInline preload="metadata" src={url} aria-label={alt || '학습 영상'} style={{ aspectRatio: 'auto 16 / 9', objectFit: 'contain' }} onTimeUpdate={event => { position.current = event.currentTarget.currentTime; }} onLoadedMetadata={event => {
          const video = event.currentTarget;
          // Request the opening frame even when the browser only preloads metadata.
          // Seeking while paused does not start playback or sound.
          if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(position.current || 0.001, video.duration);
        }} onError={() => setFailed(true)} />}
    {caption && <figcaption>{caption}</figcaption>}
    {failed && <div role="alert"><p>자료를 열지 못했습니다. 연결을 다시 확인하거나 원본 파일을 내려받아 주세요.</p><button type="button" className="btn small" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>자료 다시 열기</button><a href={url + '&download=1'}>원본 파일 내려받기</a></div>}
  </figure>;
}
