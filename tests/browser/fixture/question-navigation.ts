import { useSyncExternalStore } from 'react';

const subscribe = (callback: () => void) => {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
};
export function useSearchParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return new URLSearchParams(search);
}
export function usePathname() { return '/admin/questions'; }
export function useRouter() {
  return { push: (url: string) => {
    const target = new URL(url, window.location.origin);
    window.history.pushState(null, '', '/question-comments-test' + target.search);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, replace: () => {}, refresh: () => {} };
}
