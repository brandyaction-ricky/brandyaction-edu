// The visitor journey is open on production, fixed DEV and branch previews (CEO 11-19 prod approval).
// Branch previews only show the preset; saved/published configs live on fixed DEV and production.
export function arrivalPublicationEnabled(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV !== 'preview';
}

// Real production (fixed DEV runs as a production target with NEXT_PUBLIC_APP_ENV=development)
// shows nothing until an administrator publishes a reviewed snapshot; the preset never leaks there.
export function arrivalRequiresPublication(env: Record<string, string | undefined> = process.env) {
  if (env.NEXT_PUBLIC_APP_ENV === 'production') return true;
  return env.VERCEL_ENV === 'production' && env.NEXT_PUBLIC_APP_ENV !== 'development';
}
