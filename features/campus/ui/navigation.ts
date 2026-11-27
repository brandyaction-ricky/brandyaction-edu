/** Navigation hints never grant access: every destination still checks the current session. */
export const campusSections = ['learning','space','community','business','support','ai','office','journal'] as const;
export function validSection(value: string | null | undefined) { return campusSections.includes(value as typeof campusSections[number]) ? value! : 'learning'; }
export const campusRooms = ['live','study','office','library'];
/** The room named in a campus address, so a reload or the way back from a lesson opens that room instead of the map. */
export function requestedRoom(search: string): string | null { const room = new URLSearchParams(search).get('room'); return room && campusRooms.includes(room) ? room : null; }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requestedEnrollment(search: string): string | null { const id = new URLSearchParams(search).get('enrollmentId'); return id && uuid.test(id) ? id : null; }
/** Only a lesson from the same enrollment can be the way out of the student lobby. */
export function campusSourceLesson(value: string | null, enrollmentId: string | null) {
 if (!value || !enrollmentId || !uuid.test(enrollmentId) || !value.startsWith('/learn/') || value.length > 600) return null;
 const [path, query = ''] = value.split('?');
 const [, root, owner, lesson, section, ...extra] = path.split('/');
 if (root !== 'learn' || owner !== enrollmentId || (lesson !== undefined && !uuid.test(lesson)) ||
     (section !== undefined && section !== 'mission') || extra.length) return null;
 const mission = new URLSearchParams(query).get('mission');
 return section === 'mission' && mission && uuid.test(mission) ? path + '?mission=' + mission : path;
}
export function campusReturnPath(value: string | null): string | null {
 if (!value || value.length > 600 || !value.startsWith('/campus/workspace?')) return null;
 try { const u = new URL(value, 'https://campus.invalid');
  if (u.origin !== 'https://campus.invalid' || u.pathname !== '/campus/workspace') return null;
  const id = u.searchParams.get('enrollmentId'); if (!id || !uuid.test(id)) return null;
  const q = new URLSearchParams({enrollmentId:id,section:validSection(u.searchParams.get('section'))});
  if (u.searchParams.get('view') === 'immersive') q.set('view','immersive');
  // The room the learner was in, so the way back opens that room instead of the map.
  const room = u.searchParams.get('room'); if (room && campusRooms.includes(room)) q.set('room', room);
  const lesson = campusSourceLesson(u.searchParams.get('fromLesson'), id);
  if (lesson) q.set('fromLesson', lesson);
  return '/campus/workspace?' + q;
 } catch { return null; }
}
export function withCampusReturn(href: string, current: string): string {
 const back = campusReturnPath(current); if (!back) return href;
 const target = new URL(href, 'https://campus.invalid');
 if (target.origin !== 'https://campus.invalid' || !/^\/(learn\/|my\/)/.test(target.pathname)) return href;
 target.searchParams.set('campusReturn', back); return target.pathname + target.search + target.hash;
}
