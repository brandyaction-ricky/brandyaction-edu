'use client';
import {useState} from 'react';
import {campusEntryPath} from '../entry';
import styles from './admin.module.css';
export function CampusEntryLinks({cohortId,slug,published,saved}:{cohortId:string;slug:string;published:boolean;saved:boolean}){
 const [notice,setNotice]=useState('');
 const links=[{name:'웨비나 참여자용',path:'/campus/live/'+slug,enabled:saved&&published,help:'로그인 없이 입장 · 공개된 행사만 사용 가능'},
 {name:'구매자 웰컴용',path:campusEntryPath(cohortId,true),enabled:!!cohortId,help:'로그인·해당 기수의 유효 수강권 필요 · 개강 전 안내 가능'},
 {name:'수강생 전용',path:campusEntryPath(cohortId),enabled:!!cohortId,help:'로그인·해당 기수 수강권 확인 · 개강 전에는 웰컴 안내'}];
 async function copy(path:string){try{await navigator.clipboard.writeText(new URL(path,window.location.origin).href);setNotice('입장 링크를 복사했어요. 현재 보고 있는 사이트의 주소입니다.');}catch{setNotice('자동 복사가 차단됐어요. 링크 열기에서 주소를 복사해 주세요.');}}
 return <section className={styles.linkHub} aria-label="대상별 캠퍼스 입장 링크"><h2>캠퍼스 입장 링크</h2><p>기수를 선택하면 대상별 주소가 준비됩니다. 링크를 공유해도 수강 권한이 새로 생기지는 않습니다.</p><div className={styles.linkCards}>{links.map(l=><article key={l.name}><h3>{l.name}</h3><p>{l.help}</p>{l.enabled?<><code>{l.path}</code><div className={styles.actions}><button type="button" aria-label={l.name+' 링크 복사'} onClick={()=>void copy(l.path)}>링크 복사</button><a href={l.path} aria-label={l.name+' 열기 ↗'} target="_blank" rel="noopener noreferrer">입장 화면 열기 ↗</a></div></>:<p>{l.name==='웨비나 참여자용'?'행사를 공개 상태로 저장하면 사용할 수 있어요.':'기수를 먼저 선택해 주세요.'}</p>}</article>)}</div>{notice&&<p role="status">{notice}</p>}</section>;
}
