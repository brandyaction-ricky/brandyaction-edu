'use client';
import { useEffect } from 'react';

// Only an in-memory warning; never persist operator input in browser storage.
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      if (link.href === window.location.href || link.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('저장하지 않은 검토 내용이 있습니다. 이 화면을 나가면 사라집니다. 이동할까요?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true); };
  }, [dirty]);
}
