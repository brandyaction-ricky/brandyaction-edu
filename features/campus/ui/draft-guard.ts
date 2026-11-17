'use client';
import {useEffect,useId} from 'react';
const drafts=new Map<string,{dirty:boolean;locked:boolean;scope?:string;visible?:boolean}>();
let approvedUntil=0;
export function campusDraftState(scope?:string,visibleOnly=false){const values=[...drafts.values()].filter(v=>(!scope||v.scope===scope)&&(!visibleOnly||v.visible!==false));return {dirty:values.some(v=>v.dirty),locked:values.some(v=>v.locked)};}
function unload(event:BeforeUnloadEvent){const state=campusDraftState();if((state.dirty||state.locked)&&Date.now()>approvedUntil){event.preventDefault();event.returnValue='';}}
function internalLink(event:MouseEvent){
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const anchor=event.target instanceof Element?event.target.closest('a[href]'):null;
 if(!(anchor instanceof HTMLAnchorElement)||anchor.download||anchor.target&&anchor.target!=='_self')return;
 const target=new URL(anchor.href,window.location.href),current=new URL(window.location.href);
 if(target.origin!==current.origin||target.pathname===current.pathname&&target.search===current.search)return;
 const state=campusDraftState();
 if(state.locked){event.preventDefault();event.stopPropagation();window.dispatchEvent(new CustomEvent('campus:navigation-blocked'));return;}
 if(state.dirty){if(!window.confirm('저장하지 않은 내용이 있습니다. 내용을 버리고 이동할까요?')){event.preventDefault();event.stopPropagation();return;}approvedUntil=Date.now()+1000;}
}
/** Only mounted draft flags, never text or attachments. One listener also guards Next.js links. */
export function useCampusDraftGuard(dirty:boolean,locked:boolean,scope?:string,visible=true){const key=useId();useEffect(()=>{if(!drafts.size){window.addEventListener('beforeunload',unload);document.addEventListener('click',internalLink,true);}drafts.set(key,{dirty,locked,scope,visible});return()=>{drafts.delete(key);if(!drafts.size){window.removeEventListener('beforeunload',unload);document.removeEventListener('click',internalLink,true);}};},[key,dirty,locked,scope,visible]);}
