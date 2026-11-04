import React from 'react';
import {createRoot} from 'react-dom/client';
import {WebinarRoom} from '../../features/campus/webinar/room';
import {WebinarAdmin} from '../../features/campus/webinar/admin';
import {event} from './data';
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(location.pathname==='/webinar-admin'?<><div style={{background:'#f5dda4',color:'#382a0d',padding:12,textAlign:'center'}}>관리자 화면 미리보기 · 예시 데이터 / 저장은 이 로컬 서버 메모리에만 임시 반영</div><WebinarAdmin/></>:<WebinarRoom event={{...event,youtubeId:params.has('video')?'abcdefghijk':''}} demo={!params.has('api')}/>);
