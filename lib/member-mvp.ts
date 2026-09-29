export const DEFAULT_MVP_COLOR = '#FFD700';
export type MemberMvp = { member: string; isMvp: boolean; color: string | null; revision: string | null };
export type MvpSettings = { color: string; revision: string | null };
export function mvpColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw Error('색상은 #FFD700처럼 6자리 색상 코드로 입력해 주세요.');
  return value.toUpperCase();
}
export function mvpSelection(isMvp: unknown, color: unknown) {
  if (typeof isMvp !== 'boolean') throw Error('우수 수강생 선정 여부를 확인해 주세요.');
  const normalized = color === null ? null : mvpColor(color);
  return { isMvp, color: isMvp ? normalized : null };
}
