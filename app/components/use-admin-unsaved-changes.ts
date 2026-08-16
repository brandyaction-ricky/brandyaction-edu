"use client";

import { useEffect } from "react";

const WARNING = "저장하지 않은 변경사항이 있습니다. 이 페이지를 나가면 입력한 내용이 사라집니다.";

export function useAdminUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = WARNING; };
    const guardLinks = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin || next.href === window.location.href) return;
      if (!window.confirm(WARNING)) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", guardLinks, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLinks, true); };
  }, [isDirty]);
}
