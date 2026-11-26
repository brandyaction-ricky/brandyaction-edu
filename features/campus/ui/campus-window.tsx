'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import styles from './workspace.module.css';
import { holdBack } from './back-close';
/** A native modal keeps keyboard focus in the task and restores it on close. */
export function CampusWindow({open,title,context,onClose,children,small=false,backCloses=false}:{open:boolean;title:string;context?:string;onClose:()=>void;children:ReactNode;small?:boolean;backCloses?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),latest=useRef({open,onClose});
 useEffect(()=>{latest.current={open,onClose};});
 useEffect(()=>open&&backCloses?holdBack(()=>latest.current.onClose()):undefined,[open,backCloses]);
 useEffect(()=>{const node=ref.current;if(!node)return;if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();return()=>{};},[open]);
 return <dialog ref={ref} className={`${styles.campusWindow} ${small?styles.smallWindow:''}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}
  onClose={()=>{
   // Chrome may close a modal on a repeated Esc without a cancel event. Ask the owner again; if it keeps the window, reopen it.
   if(!latest.current.open)return;latest.current.onClose();
   setTimeout(()=>{const node=ref.current;if(node&&latest.current.open&&!node.open)node.showModal();},0);
  }}>
  <header className={styles.windowHeader}><div><small>{context || 'MOONSHOT CAMPUS'}</small><h2>{title}</h2></div><button onClick={onClose} autoFocus aria-label={`${title} 닫기`}>닫기 <span aria-hidden="true">×</span></button></header>
  <div className={styles.windowBody}>{children}</div>
 </dialog>;
}
