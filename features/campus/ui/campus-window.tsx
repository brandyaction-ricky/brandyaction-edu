'use client';
import {useEffect,useRef,type ReactNode} from 'react';
import styles from './workspace.module.css';
/** A native modal keeps keyboard focus in the task and restores it on close. */
export function CampusWindow({open,title,onClose,children,small=false}:{open:boolean;title:string;onClose:()=>void;children:ReactNode;small?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=ref.current;if(!node)return;if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();return()=>{};},[open]);
 return <dialog ref={ref} className={`${styles.campusWindow} ${small?styles.smallWindow:''}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}>
  <header className={styles.windowHeader}><div><small>MOONSHOT CAMPUS</small><h2>{title}</h2></div><button onClick={onClose} autoFocus aria-label={`${title} 닫기`}>닫기 <span aria-hidden="true">×</span></button></header>
  <div className={styles.windowBody}>{children}</div>
 </dialog>;
}
