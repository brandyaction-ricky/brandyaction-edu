// Staff QA 11-17 (R1): members may not pick names that look like staff; staff names always carry a visible mark.
const STAFF_WORDS = /운영|멘토|관리자|브랜디액션|brandyaction|문샷팀|moonshotteam|공식|staff|admin|mentor|official/;
export const STAFF_NAME_MESSAGE = '운영진으로 보일 수 있는 이름(운영·멘토·관리자·브랜디액션 등)은 쓸 수 없어요. 다른 이름을 적어 주세요.';
export const isStaffRole = (role?: string | null) => role === 'admin' || role === 'staff';
export function staffLikeName(name: string) {
  return STAFF_WORDS.test(name.normalize('NFKC').toLowerCase().replace(/[\s·・.\-_|/()[\]]/gu, ''));
}
/** The name to store, or null when a member's name could pass for staff. */
export function campusName(name: string, role?: string | null): string | null {
  const n = name.trim();
  if (isStaffRole(role)) return (staffLikeName(n) ? n : `운영진 · ${n}`).slice(0, 24);
  return staffLikeName(n) ? null : n;
}
export function assertCampusName(name: string, role?: string | null) {
  const n = campusName(name, role);
  if (n === null) throw Object.assign(new Error(STAFF_NAME_MESSAGE), { status: 400 });
  return n;
}
