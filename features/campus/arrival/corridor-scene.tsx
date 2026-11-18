'use client';

import {useEffect, useRef, useState} from 'react';
import type {CorridorStation} from './model';

type Props = {
  station: CorridorStation;
  label?: string;
  paused: boolean;
  walkRequest: number;
  onStatus: (status: 'ready' | 'unavailable') => void;
  onArrive: (station: CorridorStation) => void;
  className: string;
};

export function CorridorScene({station, label, paused, walkRequest, onStatus, onArrive, className}: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [bridge, setBridge] = useState('');
  const current = useRef({station, label, paused, onStatus, onArrive});
  const lastWalk = useRef(walkRequest);
  useEffect(() => {
    current.current = {station, label, paused, onStatus, onArrive};
  }, [station, label, paused, onStatus, onArrive]);

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
        frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token, type:'sync', station:props.station, label:props.label, paused:props.paused}, location.origin);
        props.onStatus('ready');
      } else if (msg.type === 'error') {
        window.clearTimeout(timeout);
        props.onStatus('unavailable');
      } else if (ready && msg.type === 'arrive' && !props.paused && msg.station === props.station) {
        props.onArrive(props.station);
      }
    }
    window.addEventListener('message', receive);
    setBridge(token);
    return () => {window.removeEventListener('message', receive); window.clearTimeout(timeout);};
  }, []);
  useEffect(() => {
    if (bridge) frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token:bridge, type:'sync', station, label, paused}, location.origin);
  }, [bridge, station, label, paused]);
  useEffect(() => {
    if (walkRequest === lastWalk.current) return;
    lastWalk.current = walkRequest;
    if (bridge && !paused) frame.current?.contentWindow?.postMessage({source:'moonshot-walk-host', token:bridge, type:'walk', station}, location.origin);
  }, [walkRequest, bridge, station, paused]);
  return bridge ? <iframe ref={frame} title="문샷 웰컴존 · 직원 사무실과 라이브 홀" className={className}
    sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer"
    src={'/campus/world/tour/welcome-walk.html#bridge=' + bridge}/> : null;
}
