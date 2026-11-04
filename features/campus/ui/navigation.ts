/** Navigation hints never grant access: every destination still checks the current session. */
export const campusSections = ['learning','space','community','business','support','ai','office','journal'] as const;
export function validSection(value: string | null | undefined) { return campusSections.includes(value as typeof campusSections[number]) ? value! : 'learning'; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requestedEnrollment(search: string): string | null { const id = new URLSearchParams(search).get('enrollmentId'); return id && uuid.test(id) ? id : null; }
export function campusReturnPath(value: string | null): string | null {
 if (!value || value.length > 600 || !value.startsWith('/campus/workspace?')) return null;
 try { const u = new URL(value, 'https://campus.invalid');
  if (u.origin !== 'https://campus.invalid' || u.pathname !== '/campus/workspace') return null;
  const id = u.searchParams.get('enrollmentId'); if (!id || !uuid.test(id)) return null;
  const q = new URLSearchParams({enrollmentId:id,section:validSection(u.searchParams.get('section'))});
  if (u.searchParams.get('view') === 'immersive') q.set('view','immersive');
  return '/campus/workspace?' + q;
 } catch { return null; }
}
export function withCampusReturn(href: string, current: string): string {
 const back = campusReturnPath(current); if (!back) return href;
 const target = new URL(href, 'https://campus.invalid');
 if (target.origin !== 'https://campus.invalid' || !/^\/(learn\/|my\/)/.test(target.pathname)) return href;
 target.searchParams.set('campusReturn', back); return target.pathname + target.search + target.hash;
}
