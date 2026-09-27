"use client";
import { useEffect } from 'react';
const checkedNavigation = new WeakSet<Event>();
export function useUnsavedLearningChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {event.preventDefault();event.returnValue='';};
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || checkedNavigation.has(event)) return;
      const target=(event.target as HTMLElement)?.closest?.('a[href],button[data-leaves-learning-editor]') as HTMLElement | null;
      if (!target) return;
      if (target instanceof HTMLAnchorElement) {
        const destination=new URL(target.href), current=new URL(window.location.href);
        if (target.target === '_blank' || target.hasAttribute('download') || target.href === current.href ||
          (destination.hash && destination.origin===current.origin && destination.pathname===current.pathname && destination.search===current.search)) return;
      }
      checkedNavigation.add(event);
      if(!window.confirm('저장하지 않은 내용이 있습니다. 이 화면을 떠날까요?')){event.preventDefault();event.stopPropagation();}

    };
    window.addEventListener('beforeunload',unload); document.addEventListener('click',navigate,true);
    return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true);};
  },[dirty]);
}
