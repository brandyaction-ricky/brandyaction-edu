/** Member and operator areas remain staff-only outside isolated DEV. Published guest routes are explicitly exempted in proxy. */
export function campusPrivateRelease(){return process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://vjmjhaidlqkmascdjocw.supabase.co';}
export function isCampusProtectedPath(path:string){return /^\/(?:campus(?:\/|$)|api\/campus(?:\/|$)|admin\/campus(?:\/|$)|api\/admin\/campus(?:\/|$))/.test(path);}
