'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ArrivalRoom = 'welcome' | 'office' | 'live';

type SceneProps = {
  room: ArrivalRoom;
  demoPhase?: 'brief' | 'result';
  demoTitle?: string;
  onAction?: (id: string) => void;
  className?: string;
  onReady?: (ready: boolean) => void;
};

const tasks = [
  { id: 'welcome:begin', title: '체험용 AI 사무실로', description: '내가 맡길 첫 업무를 찾아요', custom: true },
  { id: 'office:demo', title: '업무가 완성되는 과정', description: '요청부터 수정까지 · 시연', custom: true },
  { id: 'office:request', title: '내 AI에게 맡겨보기', description: '나에게 맞는 요청문 만들기', custom: true },
  { id: 'live:calendar', title: '12월 7일 라이브', description: '배울 내용과 일정 확인', custom: true },
];
const actions: Record<ArrivalRoom, readonly string[]> = {
  welcome: ['welcome:begin'],
  office: ['office:demo', 'office:request'],
  live: ['live:calendar'],
};

/** A local presentation bridge. It never mounts the member host, presence or reporting APIs. */
export function Scene({ room, demoPhase = 'result', demoTitle = '내 AI에게 맡길 첫 업무', onAction, className, onReady }: SceneProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef('');
  const active = useRef({ room, demoPhase, demoTitle, onAction, onReady });
  const ready = useRef(false);
  const [bridge, setBridge] = useState('');

  const post = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (!token.current) return;
    frame.current?.contentWindow?.postMessage({ source: 'moonshot-tour-host', token: token.current, type, payload }, window.location.origin);
  }, []);

  useEffect(() => {
    active.current = { room, demoPhase, demoTitle, onAction, onReady };
  }, [room, demoPhase, demoTitle, onAction, onReady]);

  useEffect(() => {
    // Keep the capability tied to the iframe document, including effect reconnects.
    // A hash-only navigation does not rerun the frame's module or replace its token.
    if (!token.current) token.current = crypto.randomUUID();
    // The iframe can be created only after its browser-only message capability exists.
    setBridge(token.current);
    function receive(event: MessageEvent) {
      const message = event.data;
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow ||
          !message || message.source !== 'moonshot-tour' || message.token !== token.current) return;
      if (message.type === 'ready') {
        ready.current = true;
        // This role controls only synthetic geometry inside the static iframe. No account is granted access.
        post('role', { role: 'student' });
        post('content-config', { tasks });
        post('appearance', { nickname: '문샷 방문자', gender: 'female', model: 2, coat: '#e49a64', hairColor: '#3c2c27', skinColor: '#e8b68b', pantsColor: '#344657' });
        post('guided-demo', { phase: active.current.demoPhase, title: active.current.demoTitle.slice(0, 160) });
        // Read the most recent room: the visitor may advance while models are still loading.
        post('room', { id: active.current.room });
        post('camera', { mode: 'overall' });
        active.current.onReady?.(true);
      } else if (message.type === 'room' && ready.current && message.payload?.id === active.current.room) {
        active.current.onReady?.(true);
      } else if (message.type === 'action' && actions[active.current.room].includes(message.payload?.id)) {
        active.current.onAction?.(message.payload.id);
      } else if (message.type === 'error') {
        ready.current = false;
        active.current.onReady?.(false);
      }
    }
    window.addEventListener('message', receive);
    // Fast Refresh or an effect reconnect can retain an already loaded iframe.
    // Repeating init requests its ready acknowledgement without reloading the scene.
    if (frame.current) post('init', { guidedPreview: true, initialRoom: active.current.room, demoPhase: active.current.demoPhase, demoTitle: active.current.demoTitle.slice(0, 160), visitor: false, devPresence: false, qaCrowd: false, ambientCount: 0 });
    return () => {
      ready.current = false;
      window.removeEventListener('message', receive);
    };
  }, [post]);

  useEffect(() => {
    if (ready.current) post('room', { id: room });
  }, [room, post]);

  useEffect(() => {
    if (ready.current) post('guided-demo', { phase: demoPhase, title: demoTitle.slice(0, 160) });
  }, [demoPhase, demoTitle, post]);

  return bridge ? <iframe
    key={bridge}
    ref={frame}
    className={className}
    title="문샷 무료 체험 공간 · 웰컴존, 체험용 AI 사무실, 라이브 홀"
    src={`/campus/world/tour/index.html#bridge=${bridge}`}
    sandbox="allow-scripts allow-same-origin"
    referrerPolicy="no-referrer"
    style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
    onLoad={() => {
      ready.current = false;
      active.current.onReady?.(false);
      post('init', { guidedPreview: true, initialRoom: active.current.room, demoPhase: active.current.demoPhase, demoTitle: active.current.demoTitle.slice(0, 160), visitor: false, devPresence: false, qaCrowd: false, ambientCount: 0 });
    }}
  /> : null;
}
