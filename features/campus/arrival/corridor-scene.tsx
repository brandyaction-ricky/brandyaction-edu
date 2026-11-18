'use client';

import {useEffect, useRef, useState} from 'react';
import type {CorridorStation} from './model';
import type {VisitorAvatarId} from './visitor-avatar-options';

type Props = {
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
  onOpenSchedule: () => void;
  className: string;
};

export function CorridorScene({station, label, avatar, paused, freeRoam, walkRequest, focusRequest, onStatus, onProximity, onArrive, onOpenSchedule, className}: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [bridge, setBridge] = useState('');
  const [firstAvatar] = useState(avatar);
  const current = useRef({station, label, avatar, paused, freeRoam, onStatus, onProximity, onArrive, onOpenSchedule});
  const lastWalk = useRef(walkRequest);
  const lastFocus = useRef(focusRequest);
  useEffect(() => {
    current.current = {station, label, avatar, paused, freeRoam, onStatus, onProximity, onArrive, onOpenSchedule};
  }, [station, label, avatar, paused, freeRoam, onStatus, onProximity, onArrive, onOpenSchedule]);

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
        if (msg.type === 'open-schedule' && props.freeRoam && props.station === 7) props.onOpenSchedule();
      }
    }
    window.addEventListener('message', receive);
    setBridge(token);
    return () => {window.removeEventListener('message', receive); window.clearTimeout(timeout);};
  }, []);
  useEffect(() => {
    if (bridge) frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token:bridge, type:'sync', station, label, avatar, paused, freeRoam}, location.origin);
  }, [bridge, station, label, avatar, paused, freeRoam]);
  useEffect(() => {
    if (walkRequest === lastWalk.current) return;
    lastWalk.current = walkRequest;
    if (bridge && !paused) frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token:bridge, type:'walk', station}, location.origin);
  }, [walkRequest, bridge, station, paused]);
  useEffect(() => {
    if (focusRequest === lastFocus.current) return;
    lastFocus.current = focusRequest;
    if (bridge && !paused) frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token:bridge, type:'focus', station}, location.origin);
  }, [focusRequest, bridge, station, paused]);
  return bridge ? <iframe ref={frame} title="문샷 웰컴존 · 직원 사무실과 라이브 홀" className={className}
    sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer"
    src={'/campus/world/tour/welcome-walk.html#' + new URLSearchParams({bridge, avatar: firstAvatar})}/> : null;
}
