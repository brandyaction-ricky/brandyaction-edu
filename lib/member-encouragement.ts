export type Encouragement = { publicName: string; message: string; revision: string | null };
export type PublicEncouragement = { id: string; publicName: string; message: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function encouragementInput(publicName: unknown, message: unknown) {
  if (typeof publicName !== 'string' || publicName.length > 40 || typeof message !== 'string' || message.length > 80) throw Error('공개 별명은 40자, 응원 메시지는 80자 이내로 입력해 주세요.');
  const value = { publicName: publicName.trim(), message: message.trim() };
  if (value.message && !value.publicName) throw Error('메시지와 함께 표시할 공개 별명을 입력해 주세요.');
  return value;
}
export function readEncouragement(value: unknown): Encouragement {
  if (value == null) return { publicName: '', message: '', revision: null };
  if (typeof value !== 'object' || Array.isArray(value)) throw Error('응원 메시지를 확인하지 못했습니다.');
  const row = value as Record<string, unknown>;
  if (row.revision !== null && (typeof row.revision !== 'string' || !uuidPattern.test(row.revision))) throw Error('응원 메시지를 확인하지 못했습니다.');
  return { ...encouragementInput(row.publicName, row.message), revision: row.revision as string | null };
}
export function readEncouragementPage(value: unknown): { rows: PublicEncouragement[]; nextCursor: string | null } {
  if (!value || typeof value !== 'object') throw Error('응원 메시지를 불러오지 못했습니다.');
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.rows) || page.rows.length > 50 || (page.nextCursor !== null && (typeof page.nextCursor !== 'string' || !uuidPattern.test(page.nextCursor)))) throw Error('응원 메시지를 불러오지 못했습니다.');
  return { rows: page.rows.map(row => {
    if (!row || typeof row.id !== 'string' || !uuidPattern.test(row.id)) throw Error('응원 메시지를 불러오지 못했습니다.');
    const content = encouragementInput(row.publicName, row.message);
    if (!content.message) throw Error('응원 메시지를 불러오지 못했습니다.');
    return { id: row.id, ...content };
  }), nextCursor: page.nextCursor as string | null };
}
