'use client';
import dynamic from 'next/dynamic';
import {useEffect, useRef, useState} from 'react';
import type {CampusTourProps} from './preview';
import {LunarLobby, isLobbyRoom, type LobbyRoom} from './lunar-lobby';
import {campusSourceLesson, requestedRoom} from '../ui/navigation';
import type {StageProgram} from '../webinar/domain';
import {canEnter} from './model';
import {holdBack} from '../ui/back-close';
import {useRouter} from 'next/navigation';
import styles from './lunar-lobby.module.css';

type Door = Exclude<LobbyRoom,'live'>;
type Panel = 'stage' | 'map' | 'offer' | 'experience' | Door | null;
const labels = {study:'공부방', office:'내 AI 사무실', library:'자료실',live:'라이브 무대'};
const CampusRooms=dynamic(()=>import('./preview').then(module=>module.FourSpacesPreview), {
  loading: () => <p role="status">공간을 열고 있어요.</p>,
});
const CampusWindow=dynamic(()=>import('../ui/campus-window').then(module=>module.CampusWindow));

export function LunarCampus(props: CampusTourProps & {program?:StageProgram; sample?:boolean}) {
  const router=useRouter();
  const [entry,setEntry]=useState<Door | 'loading' | null>('loading');
  const [from,setFrom]=useState<Door | null>(null);
  const [gateVisit,setGateVisit]=useState(0);
  const [panel,setPanel]=useState<Panel>(null);
  const initialVisitor=useRef(props.visitor);
  const role=props.visitor?'guest':props.live?.role||'student';
  useEffect(()=>{
    const dest=requestedRoom(location.search);
    const visitor=initialVisitor.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the incoming room after hydration
    setEntry(isLobbyRoom(dest)&&dest!=='live'&&canEnter(role,dest)?dest:null);
    if(dest==='live'||(visitor&&!dest))setPanel('stage');
    else if(isLobbyRoom(dest)&&dest!=='live'&&!canEnter(role,dest))setPanel(dest);
    visitor?.onEnter();
  },[role]);
  function returnToCampus(room?:LobbyRoom, watch=false) {
    const url=new URL(location.href);
    if(watch)url.searchParams.set('room','live');else url.searchParams.delete('room');
    history.replaceState(history.state,'',url);
    if(room && room!=='live')setFrom(room);
    setPanel(watch?'stage':null);setEntry(null);
  }
  function enter(room:LobbyRoom) {
    if(room==='live'){setPanel('stage');return;}
    if(!canEnter(role,room)){
      if(props.visitor?.operatorReview && props.visitor.operatorEvent){
        router.push('/campus/operator?'+new URLSearchParams({room,event:props.visitor.operatorEvent}));
        return;
      }
      setPanel(room);setFrom(room);setGateVisit(n=>n+1);return;
    }
    const url=new URL(location.href);url.searchParams.set('room',room);
    history.replaceState(history.state,'',url);
    setPanel(null);setEntry(room);
  }
  useEffect(()=>{
    if(!entry || entry==='loading')return;
    return holdBack(()=>{
      const current=requestedRoom(location.search);
      returnToCampus(isLobbyRoom(current)?current:entry);
    });
  },[entry]);
  if(entry==='loading')return <>
    <link rel="preload" as="script" crossOrigin="anonymous" href="/campus/world/office/vendor/office.js"/>
    <link rel="preload" as="script" crossOrigin="anonymous" href="/campus/world/office/vendor/office3d.js"/>
    <link rel="preload" as="image" href="/campus/world/assets/study-lunar-horizon.webp"/>
    <p role="status">문샷 캠퍼스를 열고 있어요.</p>
  </>;
  if(entry)return <CampusRooms {...props} lobbyEntry={entry} returnToLobby={returnToCampus}/>;
  const lesson=props.live?campusSourceLesson(new URLSearchParams(location.search).get('fromLesson'),props.snapshot.selectedEnrollmentId):null;
  const exit=lesson?{href:lesson,label:'수업으로 돌아가기'}:props.live?{href:'/my/classes',label:'내 클래스로'}:{href:'/',label:'에듀 홈으로'};
  const program=props.program||props.live?.stageProgram;
  const close=()=>{setPanel(null);if(requestedRoom(location.search)==='live')returnToCampus();};
  const titles={stage:program?.title||'라이브 무대',map:'공간 이동',offer:'문샷에서 배우는 것',experience:'고객 발견 체험',...labels};
  return <>
    <LunarLobby key={(from||'entry')+gateVisit} from={from} avatar={props.live?.avatar} exit={exit} onEnter={enter} onMap={()=>setPanel('map')}/>
    {panel&&<CampusWindow backCloses open title={titles[panel]} context="문샷 캠퍼스" onClose={close}>
      {panel==='map'?<div className={styles.destinations}>{(['study','office','library','live'] as const).map(id=><button key={id} onClick={()=>enter(id)}>{labels[id]}<span aria-hidden="true"> →</span></button>)}</div>:
       panel==='stage'?<>
        {program?.youtubeId?<iframe className={styles.player} src={'https://www.youtube-nocookie.com/embed/'+program.youtubeId+'?playsinline=1'} title={program.title} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen/>:
         props.sample?<><video className={styles.player} controls playsInline preload="metadata" src="/campus/showcase/learning-knowledge-full-v2.mp4" aria-label="무대 시청 예시 영상"/><p className={styles.caption}>시청 예시 · 대화에서 배운 내용을 연결하는 AI 직원</p></>:
         <p>{program?new Date(program.startsAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' (한국시간) · 방송 영상이 등록되면 이곳에서 시청할 수 있어요.':'아직 예정된 라이브가 없어요.'}</p>}
        {props.visitor&&<div className={styles.destinations}><button onClick={()=>{props.visitor?.onActivity('experience');setPanel('experience');}}>고객 발견 체험</button><button onClick={()=>setPanel('offer')}>문샷 과정 안내</button></div>}
       </>:panel==='offer'||panel==='experience'?props.visitor?.renderTool(panel):
       props.visitor?.renderGate(panel)||<p>현재 이용 가능한 수강권이 필요한 공간이에요.</p>}
    </CampusWindow>}
  </>;
}
