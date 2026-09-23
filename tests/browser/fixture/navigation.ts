// Synthetic fixture only: production uses Next's route-aware hooks.
export function useSearchParams() { return new URLSearchParams(window.location.search); }
export function usePathname() { return window.location.pathname; }
export function useRouter() { return { push: (url:string)=>window.location.assign(url), replace: (url:string)=>window.location.replace(url), refresh: ()=>window.location.reload() }; }
