'use client';
import dynamic from 'next/dynamic';
import {useEffect, useRef, useState} from 'react';
import type {CampusTourProps} from './preview';
import {LunarLobby, type LobbyRoom} from './lunar-lobby';
import {campusSourceLesson, requestedRoom} from '../ui/navigation';
import type {StageProgram} from '../webinar/domain';
import {canEnter} from './model';
import {useRouter} from 'next/navigation';
import styles from './lunar-lobby.module.css';

type Door = 'study' | 'office';
function isDoor(value: unknown): value is Door {return value==='study' || value==='office';}
type Panel = 'stage' | 'map' | 'offer' | 'experience' | 'resources' | Door | null;
const labels = {study:'공부방', office:'내 AI 사무실', resources:'자료·다시보기'};
const CampusRooms=dynamic(()=>import('./preview').then(module=>module.FourSpacesPreview), {
  loading: () => <p role="status">공간을 열고 있어요.</p>,
});
// Start the room UI while the participant walks. This imports code only, without mounting a second world.
function warmRoomTools() {
  const network=(navigator as Navigator & {connection?: {saveData?: boolean}}).connection;
  if(!network?.saveData)void import('./preview').catch(()=>{});
}
const CampusWindow=dynamic(()=>import('../ui/campus-window').then(module=>module.CampusWindow));

export function LunarCampus(props: CampusTourProps & {program?:StageProgram; sample?:boolean}) {
  const router=useRouter();
  const [entry,setEntry]=useState<Door | 'loading' | null>('loading');
  const [seatedEntry,setSeatedEntry]=useState(false);
  const [from,setFrom]=useState<Door | null>(null);
  const [gateVisit,setGateVisit]=useState(0);
  const [panel,setPanel]=useState<Panel>(null);
  const initialVisitor=useRef(props.visitor);
  const role=props.visitor?'guest':props.live?.role||'student';
  const onApproach=canEnter(role,'study')||canEnter(role,'office')?warmRoomTools:undefined;
  useEffect(()=>{
    const visitor=initialVisitor.current;
    const url=new URL(location.href);
    let dest=requestedRoom(url.search);
    if(dest==='library'&&!visitor){
      dest='study';
      url.searchParams.set('room',dest);
      history.replaceState(history.state,'',url);
    }
    setEntry(isDoor(dest)&&canEnter(role,dest)?dest:null);
    if(dest==='live'||(visitor&&!dest))setPanel('stage');
    else if(dest==='library')setPanel('resources');
    else if(isDoor(dest)&&!canEnter(role,dest))setPanel(dest);
    visitor?.onEnter();
  },[role]);
  function returnToCampus(room?:LobbyRoom, watch=false) {
    const url=new URL(location.href);
    if(watch)url.searchParams.set('room','live');else url.searchParams.delete('room');
    history.replaceState(history.state,'',url);
    if(isDoor(room))setFrom(room);
    setPanel(watch?'stage':null);setEntry(null);
  }
  function enter(room:LobbyRoom,seated=false) {
    if(room==='live'){setPanel('stage');return;}
    if(room==='library'){
      if(props.visitor){setPanel('resources');return;}
      room='study';
    }
    if(!canEnter(role,room)){
      if(props.visitor?.operatorReview && props.visitor.operatorEvent){
        router.push('/campus/operator?'+new URLSearchParams({room,event:props.visitor.operatorEvent}));
        return;
      }
      setPanel(room);setFrom(room);setGateVisit(n=>n+1);return;
    }
    const url=new URL(location.href);url.searchParams.set('room',room);
    history.replaceState(history.state,'',url);
    setSeatedEntry(room==='study'&&seated);setPanel(null);setEntry(room);
  }
  if(entry==='loading')return <>
    <link rel="preload" as="script" crossOrigin="anonymous" href="/campus/world/office/vendor/office.js"/>
    <link rel="preload" as="script" crossOrigin="anonymous" href="/campus/world/office/vendor/office3d.js"/>
    <link rel="preload" as="image" href="/campus/world/assets/study-lunar-horizon.webp"/>
    <p role="status">문샷 캠퍼스를 열고 있어요.</p>
  </>;
  if(entry)return <CampusRooms {...props} lobbyEntry={entry} seatedEntry={seatedEntry} returnToLobby={returnToCampus}/>;
  const lesson=props.live?campusSourceLesson(new URLSearchParams(location.search).get('fromLesson'),props.snapshot.selectedEnrollmentId):null;
  const exit=lesson?{href:lesson,label:'수업으로 돌아가기'}:props.live?{href:'/my/classes',label:'내 클래스로'}:{href:'/',label:'에듀 홈으로'};
  const program=props.program||props.live?.stageProgram;
  const close=()=>{setPanel(null);if(['live','library'].includes(requestedRoom(location.search)||''))returnToCampus();};
  const titles={stage:program?.title||'라이브 무대',map:'공간 이동',offer:'문샷에서 배우는 것',experience:'고객 발견 체험',...labels};
  return <>
    <LunarLobby key={(from||'entry')+gateVisit} from={from} studyAccess={canEnter(role,'study')} avatar={props.live?.avatar} exit={exit} onEnter={enter} onApproach={onApproach} onMap={()=>{setPanel('map');onApproach?.();}}/>
    {panel&&<CampusWindow backCloses open title={titles[panel]} context="문샷 캠퍼스" onClose={close}>
      {panel==='map'?<>
        <div className={styles.destinations}>{(['study','office'] as const).map(id=><button key={id} onClick={()=>enter(id)}>{labels[id]} <span aria-hidden="true">→</span></button>)}</div>
        <div className={styles.utilities}><button onClick={()=>setPanel('stage')}>라이브 보기</button>{props.visitor&&<button onClick={()=>enter('library')}>자료·다시보기</button>}</div>
       </>:panel==='resources'?props.visitor?.renderTool('library:all'):
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
