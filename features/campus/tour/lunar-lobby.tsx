'use client';
import {useEffect, useRef} from 'react';
import type {TourRoom} from './model';
import styles from './lunar-lobby.module.css';

export type LobbyRoom = Exclude<TourRoom, 'welcome'>;
export function isLobbyRoom(value: unknown): value is LobbyRoom {
  return value === 'study' || value === 'office' || value === 'live' || value === 'library';
}

export function LunarLobby({onEnter, onMap}: {onEnter: (id: LobbyRoom) => void; onMap: () => void}) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin) return;
      if (event.data?.type === 'moonshot-lobby-arrived' && isLobbyRoom(event.data.room)) onEnter(event.data.room);
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onEnter]);
  return <main className={styles.lobby} aria-label="문샷 캠퍼스 공용 로비">
    <iframe ref={frame} src="/experience/study-walk/scene" title="달 풍경 로비" />
    <button className={styles.mapButton} onClick={onMap}>공간 이동</button>
  </main>;
}
