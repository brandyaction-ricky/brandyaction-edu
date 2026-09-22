import { missionLink, type MissionFormSchema } from '@/features/mission/domain/form';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export function missionFormResponse(schema: MissionFormSchema, input: unknown, checked: unknown, draft: boolean) {
  const source = record(input);
  if (input !== undefined && (input === null || typeof input !== 'object' || Array.isArray(input))) throw new Error('질문별 답변을 확인해 주세요.');
  if (checked !== undefined && (!Array.isArray(checked) || checked.some(id => typeof id !== 'string'))) throw new Error('미션 체크 항목을 확인해 주세요.');
  const form_answers: Record<string, string> = {};
  let length = 0;
  for (const question of schema.questions) {
    const value = source[question.id] ?? '';
    if (typeof value !== 'string' || value.length > 5000) throw new Error('각 답변은 5,000자 이내로 입력해 주세요.');
    const answer = value.trim();
    length += answer.length;
    if (!draft && question.required && !answer) throw new Error(`필수 질문에 답해주세요: ${question.prompt}`);
    if (!draft && question.kind === 'link' && answer && !missionLink(answer)) throw new Error(`올바른 http(s) 링크를 입력해 주세요: ${question.prompt}`);
    form_answers[question.id] = answer;
  }
  if (length > 20000) throw new Error('질문별 답변은 모두 합쳐 20,000자 이내로 입력해 주세요.');
  const checkedIds = new Set(Array.isArray(checked) ? checked : []);
  const checklist = schema.checklist.filter(check => checkedIds.has(check.id)).map(check => check.id);
  if (!draft && schema.checklist.some(check => check.required && !checkedIds.has(check.id))) throw new Error('필수 체크 항목을 모두 확인해 주세요.');
  return { form_answers, checklist };
}

export function missionNextLabel(status: string, saved: boolean) {
  if (status === 'changes_requested' || status === 'rejected') return '보완하기';
  if (status === 'approved') return '완료한 미션 보기';
  if (status === 'submitted') return '제출 내용 보기';
  return saved ? '이어서 작성' : '미션 시작';
}
