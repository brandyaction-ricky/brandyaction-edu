export const LEARNING_NOTICE_KEY = 'edu_learning_notice';
export type LearningNotice = { message: string; revision: string | null };
export function noticeMessage(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) throw new Error('공지 문구를 200자 이내로 입력해 주세요.');
  return value.trim();
}
export function readLearningNotice(value: unknown): LearningNotice {
  if (value == null) return { message: '', revision: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('공지 설정을 확인하지 못했습니다.');
  const row = value as Record<string, unknown>;
  if (typeof row.revision !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.revision)) throw new Error('공지 설정을 확인하지 못했습니다.');
  return { message: noticeMessage(row.message), revision: row.revision };
}
