'use client';
/* eslint-disable @next/next/no-img-element -- Original and authenticated lesson images bypass the public optimizer. */
import { useId, useRef, useState } from 'react';

export function LessonImage({ src, alt = '', onError }: { src: string; alt?: string; onError?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const [opened, setOpened] = useState(false), [original, setOriginal] = useState(false);
  return <>
    <button type="button" className="lb-image-open" aria-label={`${alt || '학습 이미지'} 크게 보기`} onClick={() => { setOpened(true); setOriginal(false); dialog.current?.showModal(); }}>
      <img src={src} alt={alt} loading="lazy" onError={onError}/><span aria-hidden="true">크게 보기 ↗</span>
    </button>
    <dialog ref={dialog} className="lb-image-dialog" aria-labelledby={title}>
      <header><strong id={title}>이미지 크게 보기</strong><button type="button" className="btn small" onClick={() => dialog.current?.close()}>닫기</button></header>
      {opened && <><div className="lb-image-zoom-tools"><button type="button" className="btn small" aria-pressed={original} onClick={() => setOriginal(value => !value)}>{original ? '화면에 맞추기' : '원본 크기로 보기'}</button><span>확대 후 화면을 밀어서 볼 수 있어요.</span></div><div className={'lb-image-zoom' + (original ? ' is-original' : '')} tabIndex={0} role="region" aria-label="이미지 확대 영역"><img src={src} alt={alt} onError={onError}/></div></>}
    </dialog>
  </>;
}
