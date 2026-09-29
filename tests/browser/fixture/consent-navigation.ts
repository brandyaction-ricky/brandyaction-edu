// Model the App Router's client navigation without a second document reload.
export function useRouter() {
  return { replace: (url: string) => { window.history.replaceState(null, '', url); window.dispatchEvent(new PopStateEvent('popstate')); }, refresh: () => {} };
}
