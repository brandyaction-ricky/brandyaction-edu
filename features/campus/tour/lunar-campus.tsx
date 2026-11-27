'use client';
import dynamic from 'next/dynamic';
import {useEffect, useState} from 'react';
import type {CampusTourProps, LobbyEntry} from './preview';
import {LunarLobby, isLobbyRoom} from './lunar-lobby';
import {campusSourceLesson, requestedRoom} from '../ui/navigation';

const CampusRooms=dynamic(()=>import('./preview').then(module=>module.FourSpacesPreview), {
  loading: () => <p role="status">공간을 열고 있어요.</p>,
});

export function LunarCampus(props: CampusTourProps) {
  const [entry, setEntry] = useState<LobbyEntry | 'loading' | null>('loading');
  useEffect(() => {
    const destination = requestedRoom(location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- direct room links must also hydrate correctly
    setEntry(isLobbyRoom(destination) ? destination : null);
  }, []);
  function returnToLobby() {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(history.state, '', url);
    setEntry(null);
  }
  if (entry === 'loading') return <p role="status">캠퍼스 입구를 열고 있어요.</p>;
  const lesson = props.live ? campusSourceLesson(new URLSearchParams(location.search).get('fromLesson'), props.snapshot.selectedEnrollmentId) : null;
  const exit = lesson ? {href: lesson, label: '수업으로 돌아가기'} : props.live
    ? {href: '/my/classes', label: '내 클래스로'} : {href: '/', label: '에듀 홈으로'};
  if (entry === null) return <LunarLobby exit={exit} avatar={props.live?.avatar} onEnter={setEntry} onMap={() => setEntry('map')}/>;
  return <CampusRooms {...props} lobbyEntry={entry} returnToLobby={returnToLobby}/>;
}
