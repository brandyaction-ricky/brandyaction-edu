'use client';
import {useEffect,useState} from 'react';
import styles from './panel.module.css';
export function BreakOrbit(){
 const [started,setStarted]=useState<number|null>(null),[now,setNow]=useState(Date.now);
 const seconds=started===null?0:Math.min(30,Math.floor((now-started)/1000)),done=started!==null&&seconds>=30,inhale=seconds%10<4;
 useEffect(()=>{if(started===null||done)return;const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[started,done]);
 return <section className={styles.breakOrbit} aria-label="나만의 30초 쉬기"><h4>궤도에서 잠깐 쉬기</h4><p>힘을 빼고, 편한 만큼 호흡해요.</p><div className={styles.breathRing} data-expanded={started!==null&&!done&&inhale} aria-hidden="true"/><p role="status">{started===null?'준비되면 시작하세요.':done?'다시 시작할 준비가 되면 돌아오세요.':inhale?'천천히 들이쉬기':'편하게 내쉬기'}</p><small>{started===null?'기록이나 점수 없이 나만 쉬는 시간':`${30-seconds}초`}</small><div className={styles.controls}><button onClick={()=>{setNow(Date.now());setStarted(Date.now());}}>{started===null?'30초 쉬기 시작':'다시 시작'}</button>{started!==null&&<button onClick={()=>setStarted(null)}>쉬기 그만하기</button>}</div></section>;
}
