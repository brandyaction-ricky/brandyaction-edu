export type MissionQuestion = { id: string; prompt: string; kind: 'text' | 'link'; required: boolean };
export type MissionCheck = { id: string; label: string; required: boolean };
export type MissionFormSchema = { version: 1; questions: MissionQuestion[]; checklist: MissionCheck[] };
export const emptyMissionForm = (): MissionFormSchema => ({ version: 1, questions: [], checklist: [] });
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v);
export function missionLink(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function validateMissionForm(value: unknown): MissionFormSchema {
  const form = record(value);
  if (form.version !== 1 || !Array.isArray(form.questions) || !Array.isArray(form.checklist) || form.questions.length > 12 || form.checklist.length > 20) throw new Error('질문은 12개, 체크 항목은 20개까지 구성할 수 있습니다.');
  const ids = new Set<string>();
  function id(v: unknown) { if (!validId(v) || ids.has(v)) throw new Error('질문과 체크 항목의 식별자를 확인해 주세요.'); ids.add(v); return v; }
  const questions = form.questions.map(value => {
    const q = record(value);
    if (typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.trim().length > 500 || !['text', 'link'].includes(String(q.kind)) || typeof q.required !== 'boolean') throw new Error('질문 내용과 답변 형식을 확인해 주세요.');
    return { id: id(q.id), prompt: q.prompt.trim(), kind: q.kind as 'text' | 'link', required: q.required };
  });
  const checklist = form.checklist.map(value => {
    const c = record(value);
    if (typeof c.label !== 'string' || !c.label.trim() || c.label.trim().length > 200 || typeof c.required !== 'boolean') throw new Error('체크 항목을 200자 이내로 입력해 주세요.');
    return { id: id(c.id), label: c.label.trim(), required: c.required };
  });
  return { version: 1, questions, checklist };
}
export function readMissionForm(value: unknown): MissionFormSchema {
  if (value == null || Object.keys(record(value)).length === 0) return emptyMissionForm();
  return validateMissionForm(value);
}
export function missionFormResponse(schema: MissionFormSchema, input: unknown, checked: unknown, draft: boolean) {
  const source = record(input);
  if (input !== undefined && (input === null || typeof input !== 'object' || Array.isArray(input))) throw new Error('질문별 답변을 확인해 주세요.');
  if (checked !== undefined && (!Array.isArray(checked) || checked.some(id => typeof id !== 'string'))) throw new Error('미션 체크 항목을 확인해 주세요.');
  const form_answers: Record<string, string> = {};
  let length = 0;
  for (const q of schema.questions) {
    const value = source[q.id] ?? '';
    if (typeof value !== 'string' || value.length > 5000) throw new Error('각 답변은 5,000자 이내로 입력해 주세요.');
    const answer = value.trim(); length += answer.length;
    if (!draft && q.required && !answer) throw new Error(`필수 질문에 답해주세요: ${q.prompt}`);
    if (!draft && q.kind === 'link' && answer && !missionLink(answer)) throw new Error(`올바른 http(s) 링크를 입력해 주세요: ${q.prompt}`);
    form_answers[q.id] = answer;
  }
  if (length > 20000) throw new Error('질문별 답변은 모두 합쳐 20,000자 이내로 입력해 주세요.');
  const checkedIds = new Set(Array.isArray(checked) ? checked : []);
  const checklist = schema.checklist.filter(c => checkedIds.has(c.id)).map(c => c.id);
  if (!draft && schema.checklist.some(c => c.required && !checkedIds.has(c.id))) throw new Error('필수 체크 항목을 모두 확인해 주세요.');
  return { form_answers, checklist };
}
export function missionNextLabel(status: string, saved: boolean) {
  return status === 'changes_requested' || status === 'rejected' ? '보완하기' : status === 'approved' ? '완료한 미션 보기' : status === 'submitted' ? '제출 내용 보기' : saved ? '이어서 작성' : '미션 시작';
}
