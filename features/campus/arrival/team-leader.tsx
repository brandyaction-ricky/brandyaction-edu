import {useEffect, useId, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, Maximize, Minimize, Pause, Play, RotateCcw} from 'lucide-react';
import styles from './team-leader.module.css';

const VIDEO_SOURCE = '/campus/arrival/team-leader-telegram.mp4';
const VIDEO_LABEL = '텔레그램에서 AI 직원에게 일을 맡기고 보고받는 모습';
const DEFAULT_GREETING = 'AI봇들과 함께 일하면 어떻게 될까요?';

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
  const body = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const videoHeading = useRef<HTMLHeadingElement>(null);
  const autoplayTimer = useRef<number | undefined>(undefined);
  const bodyId = useId();
  const descriptionId = useId();

  useEffect(() => {heading.current?.focus({preventScroll: true});}, []);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
    if (!showVideo) return;
    const media = video.current;
    videoHeading.current?.focus({preventScroll: true});
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

  function toggleVideo() {
    if (!showVideo) {
      setPlaying(false);
      setEnded(false);
      setDuration(0);
      setPosition(0);
      setPlaybackError(false);
    }
    setShowVideo(!showVideo);
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
      <header className={styles.header}>
        <h2 tabIndex={-1} ref={heading}>팀장의 첫 업무 보고</h2>
        <button type="button" className={styles.back} onClick={() => leave(onClose)}><ArrowLeft size={16} aria-hidden="true"/>사무실로</button>
      </header>
      <div className={styles.body} id={bodyId} ref={body}>
        {!showVideo ? <div className={styles.report}>
          {greeting !== DEFAULT_GREETING && <p className={styles.greeting}>{greeting}</p>}
          <div className={styles.question}>
            <p>마스크팩 가상 사례 · 자주 나온 질문</p>
            <h3>마스크팩을 붙이고 자도 될까요?</h3>
          </div>
          <dl className={styles.findings}>
            <div><dt>후기에서 발견한 것</dt><dd>팩을 언제 떼야 할지 헷갈린다는 이야기가 반복됐어요.</dd></div>
            <div><dt>광고 첫 장면에 넣은 답</dt><dd>이 제품은 <strong>10~15분</strong> 뒤에 떼어내세요.</dd></div>
          </dl>
          <p className={styles.summary}>광고를 보고 문의한 고객에게도 같은 사용 시간을 안내합니다. 경쟁사 스파이가 후기에서 그 단서를 어떻게 찾았는지 보세요.</p>
        </div> : <div className={styles.screening}>
          <h3 tabIndex={-1} ref={videoHeading}>텔레그램에서 업무가 오가는 모습</h3>
          <p id={descriptionId} className={styles.videoCaption}>팀장이 업무를 요청하면, 직원이 자료를 확인하고 결과를 보고합니다. 영상은 소리 없이 재생돼요.</p>
          <div className={styles.player} ref={player}>
            <div className={styles.picture}>
              <video ref={video} src={VIDEO_SOURCE} muted playsInline preload="metadata" width={464} height={848}
                aria-label={VIDEO_LABEL} aria-describedby={descriptionId}
                onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
                onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
                onPlay={() => {setPlaying(true); setEnded(false);}}
                onPause={() => setPlaying(false)}
                onEnded={() => {setPlaying(false); setEnded(true);}}
                onError={() => {setPlaying(false); setPlaybackError(true);}}/>
            </div>
            <div className={styles.controls} role="group" aria-label="영상 재생 조작">
              <button type="button" onClick={togglePlay} aria-label={playing ? '일시정지' : ended ? '다시 재생' : '재생'}>
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
          {playbackError && <div className={styles.error}>
            <p role="status">영상을 불러오지 못했어요.</p>
            <button type="button" onClick={() => {
              const media = video.current;
              if (!media) return;
              setPlaybackError(false);
              media.load();
              void media.play().catch(() => {});
            }}>다시 불러오기</button>
          </div>}
        </div>}
      </div>
      <footer className={styles.actions}>
        <button className={styles.videoToggle} type="button" aria-expanded={showVideo} aria-controls={bodyId} onClick={toggleVideo}>
          {showVideo ? <><ArrowLeft size={16} aria-hidden="true"/>업무 보고로 돌아가기</> : <><Play size={16} aria-hidden="true"/>텔레그램 시연 보기</>}
        </button>
        <button type="button" className={styles.cta} onClick={() => leave(onComplete)}>경쟁사 스파이 만나기<ArrowRight size={17} aria-hidden="true"/></button>
      </footer>
    </div>
  </section>;
}
