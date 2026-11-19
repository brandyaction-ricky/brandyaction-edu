import {useEffect, useId, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Maximize, Minimize, Pause, Play, RotateCcw} from 'lucide-react';
import progression from './progression.module.css';
import styles from './team-leader.module.css';

const VIDEO_SOURCE = '/campus/arrival/team-leader-telegram.mp4';
const VIDEO_LABEL = '텔레그램에서 AI 직원에게 일을 맡기고 보고받는 모습';

function timestamp(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function TeamLeader({greeting, onClose, onComplete}: {greeting: string; onClose: () => void; onComplete: () => void}) {
  const [showVideo, setShowVideo] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLButtonElement>(null);
  const autoplayTimer = useRef<number | undefined>(undefined);
  const descriptionId = useId();

  useEffect(() => {heading.current?.focus({preventScroll: true});}, []);
  useEffect(() => {
    if (!showVideo) return;
    const media = video.current;
    controls.current?.focus({preventScroll: true});
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360;
    autoplayTimer.current = window.setTimeout(() => {
      void media?.play().catch(() => {/* The visible play button is available if autoplay is blocked. */});
    }, delay);
    return () => {window.clearTimeout(autoplayTimer.current); media?.pause();};
  }, [showVideo]);
  useEffect(() => {
    function handleFullscreen() {setFullscreen(document.fullscreenElement === player.current);}
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  function leave(callback: () => void) {
    window.clearTimeout(autoplayTimer.current);
    video.current?.pause();
    if (player.current && document.fullscreenElement === player.current) void document.exitFullscreen().catch(() => {});
    callback();
  }

  function togglePlay() {
    window.clearTimeout(autoplayTimer.current);
    const media = video.current;
    if (!media) return;
    if (media.paused || media.ended) void media.play().catch(() => {});
    else media.pause();
  }

  function seek(value: number) {
    if (!video.current) return;
    if (value < duration) setEnded(false);
    video.current.currentTime = value;
    setPosition(value);
  }

  async function toggleFullscreen() {
    const container = player.current;
    const media = video.current as (HTMLVideoElement & {webkitEnterFullscreen?: () => void}) | null;
    if (!container || !media) return;
    try {
      if (document.fullscreenElement === container) {await document.exitFullscreen(); return;}
      if (document.fullscreenEnabled && container.requestFullscreen) {await container.requestFullscreen(); return;}
      media.webkitEnterFullscreen?.();
    } catch {
      try {media.webkitEnterFullscreen?.();} catch {/* Inline playback remains available. */}
    }
  }

  return <section className={styles.scene} aria-label="팀장 봇 안내" onKeyDown={event => {
    if (event.key === 'Escape' && !document.fullscreenElement) {
      event.preventDefault();
      leave(onClose);
    }
  }}>
    <div className={styles.content}>
      <button type="button" className={styles.back} onClick={() => leave(onClose)}><ArrowLeft size={18} aria-hidden="true"/>사무실로</button>
      {!showVideo ? <div className={styles.intro}>
        <h2 tabIndex={-1} ref={heading}>{greeting}</h2>
        <button className={styles.cta} type="button" onClick={() => setShowVideo(true)}><Play size={17} aria-hidden="true"/>지금 확인하기</button>
      </div> : <div className={styles.screening}>
        <div className={styles.player} ref={player}>
          <div className={styles.picture}>
            <video ref={video} src={VIDEO_SOURCE} muted playsInline preload="metadata" width={464} height={848}
              aria-label={VIDEO_LABEL} aria-describedby={descriptionId}
              onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
              onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
              onPlay={() => {setPlaying(true); setEnded(false);}}
              onPause={() => setPlaying(false)}
              onEnded={() => {setPlaying(false); setEnded(true);}}
              onError={() => setPlaybackError(true)}/>
          </div>
          <div className={styles.controls} role="group" aria-label="영상 재생 조작">
            <button type="button" ref={controls} onClick={togglePlay} aria-label={playing ? '일시정지' : ended ? '다시 재생' : '재생'}>
              {playing ? <Pause size={19} aria-hidden="true"/> : ended ? <RotateCcw size={19} aria-hidden="true"/> : <Play size={19} aria-hidden="true"/>}
            </button>
            <input type="range" aria-label="재생 위치" aria-valuetext={`${timestamp(position)} / ${timestamp(duration)}`} min={0} max={duration || 1} step={0.1}
              value={position} disabled={!duration} onChange={event => seek(event.currentTarget.valueAsNumber)}/>
            <span aria-hidden="true">{timestamp(position)} / {timestamp(duration)}</span>
            <button type="button" aria-label={fullscreen ? '전체 화면 닫기' : '전체 화면'} onClick={() => void toggleFullscreen()}>
              {fullscreen ? <Minimize size={19} aria-hidden="true"/> : <Maximize size={19} aria-hidden="true"/>}
            </button>
          </div>
        </div>
        <div className={styles.next}>
          <p id={descriptionId}>텔레그램에서 일을 맡기고 AI 직원에게 보고받는 20초 무음 영상이에요.</p>
          {playbackError && <p className={styles.error} role="status">영상을 불러오지 못했어요. <button type="button" onClick={() => {
            const media = video.current;
            if (!media) return;
            setPlaybackError(false);
            media.load();
            void media.play().catch(() => {});
          }}>다시 불러오기</button></p>}
          <button type="button" className={progression.nextAction} onClick={() => leave(onComplete)}>경쟁사 스파이 만나기<ArrowRight size={16} aria-hidden="true"/></button>
        </div>
      </div>}
    </div>
  </section>;
}
