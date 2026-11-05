'use client';
import {useState,type ReactNode} from 'react';
import styles from '../welcome/welcome.module.css';
export function EditorDisclosure({title,initialOpen=false,children}:{title:ReactNode;initialOpen?:boolean;children:ReactNode}){
 const [open,setOpen]=useState(initialOpen);
 return <details className={styles.editArticle} open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{title}</summary>{children}</details>;
}
