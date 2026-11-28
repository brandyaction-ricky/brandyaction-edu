'use client';
import {useEffect, useRef, useState} from 'react';
import {readTourAvatar, TOUR_AVATAR_KEY, type TourAvatar} from './appearance';
import type {TourRoom} from './model';
import styles from './lunar-lobby.module.css';

export type LobbyRoom = Exclude<TourRoom, 'welcome'>;
export function isLobbyRoom(value: unknown): value is LobbyRoom {
  return value === 'study' || value === 'office' || value === 'live' || value === 'library';
}

export function LunarLobby({from, studyAccess, avatar, exit, onEnter, onApproach, onMap}: {from: Exclude<LobbyRoom, 'live'> | null; studyAccess: boolean; exit: {href: string; label: string}; avatar?: TourAvatar | null; onEnter: (id: LobbyRoom, seated?: boolean) => void; onApproach?: () => void; onMap: () => void}) {
  // Snapshot cosmetic choices on entry; a profile refresh must not reset a walk in progress.
  const [sceneUrl] = useState(() => {
    const look = avatar ?? readTourAvatar(TOUR_AVATAR_KEY);
    const appearance = new URLSearchParams({gender: look.gender, model: String(look.model),
      coat: look.coat, hairColor: look.hairColor, skinColor: look.skinColor, pantsColor: look.pantsColor});
    if (studyAccess) appearance.set('study','open');
    if (from) appearance.set('from',from);
    return '/experience/study-walk/scene#' + appearance;
  });
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin) return;
      if (event.data?.type === 'moonshot-room-approach') onApproach?.();
      if (event.data?.type === 'moonshot-watch-stage') onEnter('live');
      if (event.data?.type === 'moonshot-lobby-arrived' && isLobbyRoom(event.data.room)) onEnter(event.data.room,event.data.seated===true && event.data.room==='study');
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onEnter,onApproach]);
  return <main className={styles.lobby} aria-label="문샷 캠퍼스">
    <iframe ref={frame} src={sceneUrl} title="달 풍경 캠퍼스" />
    <nav className={styles.actions} aria-label="캠퍼스 이동">
      <button onClick={onMap}>공간 이동</button>
      <a href={exit.href}>{exit.label} <span aria-hidden="true">→</span></a>
    </nav>
  </main>;
}
