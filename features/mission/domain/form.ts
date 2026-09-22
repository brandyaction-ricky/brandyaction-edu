export type MissionQuestion = { id: string; prompt: string; kind: 'text' | 'link'; required: boolean };
export type MissionCheck = { id: string; label: string; required: boolean };
export type MissionFormSchema = { version: 1; questions: MissionQuestion[]; checklist: MissionCheck[] };

export const emptyMissionForm = (): MissionFormSchema => ({ version: 1, questions: [], checklist: [] });

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const validId = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[a-zA-Z0-9_-]{1,80}$/.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);

export function missionLink(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateMissionForm(value: unknown): MissionFormSchema {
  const form = record(value);
  if (form.version !== 1 || !Array.isArray(form.questions) || !Array.isArray(form.checklist) || form.questions.length > 12 || form.checklist.length > 20) {
    throw new Error('질문은 12개, 체크 항목은 20개까지 구성할 수 있습니다.');
  }
  const ids = new Set<string>();
  function id(value: unknown) {
    if (!validId(value) || ids.has(value)) throw new Error('질문과 체크 항목의 식별자를 확인해 주세요.');
    ids.add(value);
    return value;
  }
  const questions = form.questions.map(value => {
    const question = record(value);
    if (typeof question.prompt !== 'string' || !question.prompt.trim() || question.prompt.trim().length > 500 || !['text', 'link'].includes(String(question.kind)) || typeof question.required !== 'boolean') {
      throw new Error('질문 내용과 답변 형식을 확인해 주세요.');
    }
    return { id: id(question.id), prompt: question.prompt.trim(), kind: question.kind as 'text' | 'link', required: question.required };
  });
  const checklist = form.checklist.map(value => {
    const check = record(value);
    if (typeof check.label !== 'string' || !check.label.trim() || check.label.trim().length > 200 || typeof check.required !== 'boolean') {
      throw new Error('체크 항목을 200자 이내로 입력해 주세요.');
    }
    return { id: id(check.id), label: check.label.trim(), required: check.required };
  });
  return { version: 1, questions, checklist };
}

export function readMissionForm(value: unknown): MissionFormSchema {
  if (value == null || Object.keys(record(value)).length === 0) return emptyMissionForm();
  return validateMissionForm(value);
}
