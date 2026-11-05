'use client';
import {useEffect,useRef} from 'react';
import {type CampusResource,youtubeVideoId} from './resources';
import styles from './resource-library.module.css';
/** An in-space cinema surface: no video frames are copied into the WebGL renderer. */
export function LibraryScreen({video,onClose,roomLabel='자료실'}:{roomLabel?:string;video:CampusResource|null;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(video&&!ref.current?.open)ref.current?.showModal();else if(!video&&ref.current?.open)ref.current.close();},[video]);
 const id=video&&youtubeVideoId(video.url);
 return <dialog ref={ref} className={styles.cinema} aria-label={roomLabel+' 대형 스크린'} onCancel={e=>{e.preventDefault();onClose();}}><header><div><small>MOONSHOT · {roomLabel} 다시보기</small><h2>{video?.title}</h2></div><button autoFocus onClick={onClose}>영상 닫기</button></header>{id&&<iframe title={video.title} src={'https://www.youtube-nocookie.com/embed/'+id} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}<footer><span>영상 재생은 각자 조작해요. 닫으면 {roomLabel}으로 돌아갑니다.</span>{video&&<a href={video.url} target="_blank" rel="noopener noreferrer">유튜브에서 보기 ↗</a>}</footer></dialog>;
}
