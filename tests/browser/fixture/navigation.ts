// Only the retained Platform fixture emulates SPA navigation. Other fixtures
// intentionally use document navigation and retain their existing behavior.
import { useSyncExternalStore } from 'react';
const retained = new URLSearchParams(window.location.search).has('navigationFixture');
const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
function useLocation() {
  return useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
}
export function useSearchParams() { return new URLSearchParams(useLocation().split('?')[1] || ''); }
export function usePathname() { return useLocation().split('?')[0]; }
function navigate(url: string, replace = false) {
  if (!retained) { if (replace) window.location.replace(url); else window.location.assign(url); return; }
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function useRouter() { return { push: (url:string)=>navigate(url), replace: (url:string)=>navigate(url, true), refresh: ()=>window.location.reload() }; }
