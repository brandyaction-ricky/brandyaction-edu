/** Navigation stays hidden outside isolated DEV. Explicit member routes enforce enrollment; admin and QA routes remain operator-only. */
export function campusPrivateRelease(){return process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://vjmjhaidlqkmascdjocw.supabase.co';}
export function isCampusProtectedPath(path:string){return /^\/(?:campus(?:\/|$)|api\/campus(?:\/|$)|admin\/campus(?:\/|$)|api\/admin\/campus(?:\/|$))/.test(path);}
