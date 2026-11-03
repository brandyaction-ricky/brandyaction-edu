'use client';
import {useEffect,useState} from 'react';
import type {CampusSnapshot} from '../contracts';
import {ID} from './domain';
import {MiniFocus} from './mini-focus';
import styles from './panel.module.css';
// Mount only inside the authenticated EDU lesson layout with the campus/space flags on.
// The locally remembered IDs never authorize data access: the server rechecks scope and owner.
export function LessonFocus({returnHref='/campus/workspace?section=space'}:{returnHref?:string}){
 const [snapshot,setSnapshot]=useState<CampusSnapshot|null>(null);
 useEffect(()=>{let active=true;const controller=new AbortController();try{const pointer=JSON.parse(sessionStorage.getItem('moonshot-active-focus:live')||'null');if(!pointer||!ID.test(pointer.viewerId)||!ID.test(pointer.enrollmentId))return;void fetch('/api/campus?enrollmentId='+encodeURIComponent(pointer.enrollmentId),{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async r=>{if(!r.ok)return;const data=await r.json() as CampusSnapshot;if(active&&data.viewer.id===pointer.viewerId&&data.selectedEnrollmentId===pointer.enrollmentId&&data.scopes.some(s=>s.enrollmentId===pointer.enrollmentId))setSnapshot(data);}).catch(()=>{});}catch{/* Missing or old local pointer means there is no focus bar. */}return()=>{active=false;controller.abort();};},[]);
 if(!snapshot)return null;return <div className={styles.lessonMini}><MiniFocus snapshot={snapshot} onReturn={()=>{const target=new URL(returnHref,window.location.origin);if(target.origin!==window.location.origin)return;target.searchParams.set('enrollmentId',snapshot.selectedEnrollmentId!);window.location.assign(target.pathname+target.search+target.hash);}}/></div>;
}
