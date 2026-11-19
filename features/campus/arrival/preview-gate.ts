// The visitor journey is open on production, fixed DEV and branch previews (CEO 11-19 prod approval).
// Branch previews only show the preset; saved/published configs live on fixed DEV and production.
export function arrivalPublicationEnabled(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV !== 'preview';
}
