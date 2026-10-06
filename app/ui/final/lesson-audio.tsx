"use client";

import { useEffect, useRef, useState, type AudioHTMLAttributes } from 'react';
import './lesson-audio.css';

const activeAudioEvent = 'edu:lesson-audio-active';
type Position = { top: number; left: number; width: number; height: number };

export function LessonAudio({ floating = false, ...props }: AudioHTMLAttributes<HTMLAudioElement> & { floating?: boolean }) {
  const anchor = useRef<HTMLDivElement>(null), player = useRef<HTMLDivElement>(null), audio = useRef<HTMLAudioElement>(null);
  const [active, setActive] = useState(false), [position, setPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!floating) return;
    const otherAudio = (event: Event) => {
      if ((event as CustomEvent).detail !== audio.current) { audio.current?.pause(); setActive(false); }
    };
    const media = audio.current;
    window.addEventListener(activeAudioEvent, otherAudio);
    return () => { window.removeEventListener(activeAudioEvent, otherAudio); media?.pause(); };
  }, [floating]);

  useEffect(() => {
    if (!floating || !active) return;
    let frame = 0;
    const root = anchor.current;
    const editor = root?.closest('.ldc-editor');
    const toolbar = editor?.querySelector('.ldc-sticky-toolbar');
    const header = document.querySelector('.adm-topbar, .edu-front .site-header');
    const measure = () => {
      frame = 0;
      if (!root || !player.current) return;
      const rect = root.getBoundingClientRect();
      const headerBottom = Math.max(0, header?.getBoundingClientRect().bottom || 0);
      const tools = toolbar?.getBoundingClientRect();
      const top = Math.max(headerBottom, tools && tools.top <= headerBottom + 16 ? tools.bottom : 0) + 8;
      const left = Math.max(8, rect.left), width = Math.max(0, Math.min(rect.width, window.innerWidth - left - 8));
      const next = rect.top < top || rect.top >= window.innerHeight
        ? { top, left, width, height: root.offsetHeight } : null;
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    [root, editor, toolbar, header].forEach(element => { if (element) observer.observe(element); });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, [active, floating]);

  const docked = floating && active && position;
  // Keep the same media element when docking so playback and native controls survive scrolling.
  const media = <audio {...props} ref={audio} controls preload="none" onPlay={event => {
    if (floating) { setActive(true); window.dispatchEvent(new CustomEvent(activeAudioEvent, { detail: event.currentTarget })); }
    props.onPlay?.(event);
  }} onEnded={event => { setActive(false); props.onEnded?.(event); }} />;
  if (!floating) return media;
  return <div ref={anchor} tabIndex={-1} className="lesson-audio-anchor" style={docked ? { minHeight: docked.height } : undefined}>
    <div ref={player} className={'lesson-audio-player' + (docked ? ' is-floating' : '')}
      style={docked ? { top: docked.top, left: docked.left, width: docked.width } : undefined}>
      <div className="lesson-audio-tools" hidden={!docked}>
        <strong>{props['aria-label'] || '학습 음성'}</strong>
        <button type="button" onClick={() => { anchor.current?.focus({ preventScroll: true }); anchor.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }}>음성 위치로</button>
        <button type="button" onClick={() => { audio.current?.pause(); setActive(false); }}>닫고 일시정지</button>
      </div>
      {media}
    </div>
  </div>;
}
