'use client';
import {useState,useSyncExternalStore} from 'react';
import {browserLoginPath} from '@/lib/embedded-browser';
import styles from './browser-login-help.module.css';

const subscribe=()=>()=>{};
const currentOrigin=()=>location.origin;
const serverOrigin=()=>'';
export function BrowserLoginHelp({next,embedded,requested}:{next:string;embedded:boolean;requested:number}) {
  const [open,setOpen]=useState(embedded||requested>0),[message,setMessage]=useState('');
  const origin=useSyncExternalStore(subscribe,currentOrigin,serverOrigin);
  const url=origin?origin+browserLoginPath(next):'';
  async function copy(){try{await navigator.clipboard.writeText(url);setMessage('입장 주소를 복사했어요. Safari 또는 Chrome 주소창에 붙여 넣어 주세요.');}catch{setMessage('아래 주소를 길게 눌러 복사한 뒤 Safari 또는 Chrome에서 열어 주세요.');}}
  return <details className={styles.help} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>앱 안에서 열었거나 Google 로그인이 멈추나요?</summary>
    <p>텔레그램·카카오톡 안에서는 Google 로그인이 제한될 수 있어요. Safari 또는 Chrome에서 이 입장 주소를 열어 주세요.</p>
    <ol><li>현재 창의 나침반 아이콘 또는 메뉴에서 ‘브라우저에서 열기’를 선택하세요.</li><li>메뉴가 없다면 아래 주소를 복사해 Safari·Chrome에 붙여 넣으세요.</li><li>그 브라우저에서 로그인을 시작하면 원래 입장하려던 공간으로 이어집니다.</li></ol>
    <button className="btn full" type="button" onClick={()=>void copy()} disabled={!url}>입장 주소 복사</button>
    {url&&<input aria-label="외부 브라우저에서 열 입장 주소" readOnly value={url} onFocus={e=>e.currentTarget.select()}/>}
    {message&&<p role="status">{message}</p>}
  </details>;
}
