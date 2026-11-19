'use client';

import {useEffect, useRef, useState, type RefObject} from 'react';
import type {CorridorStation} from './model';
import type {OnboardingGuide} from './onboarding-program';
import type {VisitorAvatarId} from './visitor-avatar-options';

type Props = {
  frame: RefObject<HTMLIFrameElement | null>;
  station: CorridorStation;
  label?: string;
  avatar: VisitorAvatarId;
  paused: boolean;
  freeRoam: boolean;
  walkRequest: number;
  focusRequest: number;
  onStatus: (status: 'ready' | 'unavailable') => void;
  onProximity: (station: CorridorStation, near: boolean) => void;
  onArrive: (station: CorridorStation) => void;
  onOpenGuide: (guide: OnboardingGuide) => void;
  className: string;
};

export function CorridorScene({frame, station, label, avatar, paused, freeRoam, walkRequest, focusRequest, onStatus, onProximity, onArrive, onOpenGuide, className}: Props) {
  const [bridge, setBridge] = useState('');
  const [firstAvatar] = useState(avatar);
  const current = useRef({station, label, avatar, paused, freeRoam, onStatus, onProximity, onArrive, onOpenGuide});
  const lastWalk = useRef(walkRequest);
  const lastFocus = useRef(focusRequest);
  useEffect(() => {
    current.current = {station, label, avatar, paused, freeRoam, onStatus, onProximity, onArrive, onOpenGuide};
  }, [station, label, avatar, paused, freeRoam, onStatus, onProximity, onArrive, onOpenGuide]);

  useEffect(() => {
    const token = crypto.randomUUID();
    let ready = false;
    const timeout = window.setTimeout(() => {if (!ready) current.current.onStatus('unavailable');}, 12000);
    function receive(event: MessageEvent) {
      const msg = event.data;
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow ||
        msg?.source !== 'moonshot-walk' || msg.token !== token) return;
      const props = current.current;
      if (msg.type === 'ready') {
        ready = true;
        window.clearTimeout(timeout);
        frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token, type:'sync', station:props.station, label:props.label, avatar:props.avatar, paused:props.paused, freeRoam:props.freeRoam}, location.origin);
        props.onStatus('ready');
      } else if (msg.type === 'error') {
        window.clearTimeout(timeout);
        props.onStatus('unavailable');
      } else if (ready && !props.paused && msg.station === props.station) {
        if (msg.type === 'approach' || msg.type === 'depart') props.onProximity(props.station, msg.type === 'approach');
        if (msg.type === 'arrive') props.onArrive(props.station);
        if (msg.type === 'open-guide' && props.freeRoam && props.station === 7 && (msg.guide === 'materials' || msg.guide === 'intro')) props.onOpenGuide(msg.guide);
      }
    }
    window.addEventListener('message', receive);
    setBridge(token);
    return () => {window.removeEventListener('message', receive); window.clearTimeout(timeout);};
  }, [frame]);
  useEffect(() => {
    if (!bridge) return;
    const focus = !paused && focusRequest !== lastFocus.current;
    lastFocus.current = focusRequest;
    frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token:bridge, type:'sync', station, label, avatar, paused, freeRoam, focus}, location.origin);
  }, [bridge, frame, station, label, avatar, paused, freeRoam, focusRequest]);
  useEffect(() => {
    if (walkRequest === lastWalk.current) return;
    lastWalk.current = walkRequest;
    if (bridge && !paused) frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token:bridge, type:'walk', station}, location.origin);
  }, [walkRequest, bridge, frame, station, paused]);
  return bridge ? <iframe ref={frame} title="문샷 AI 직원 체험 · 직원 사무실과 웰컴 라운지" className={className}
    sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer"
    src={'/campus/world/tour/welcome-walk.html#' + new URLSearchParams({bridge, avatar: firstAvatar})}/> : null;
}
