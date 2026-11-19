// The visitor journey is approved for branch preview and the fixed DEV site only (11-19).
// Fixed DEV is deployed as a Vercel production target but runs with NEXT_PUBLIC_APP_ENV=development;
// the real production site (NEXT_PUBLIC_APP_ENV=production) keeps the route closed.
export function arrivalPreviewClosed(env: Record<string, string | undefined> = process.env) {
  if (env.NEXT_PUBLIC_APP_ENV === 'production') return true;
  return env.VERCEL_ENV === 'production' && env.NEXT_PUBLIC_APP_ENV !== 'development';
}
