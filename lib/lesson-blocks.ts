// Versioned lesson blocks. Only the authoring/server boundary may hold quiz keys;
// learner responses must use publicLessonBlocks(), never a cast of stored JSON.
import { hasGuidedDefinition, isGuidedTool } from './lesson-guided-tools';
import { hasCalculatorDefinition, isCalculator, validateCalculatorValues } from './lesson-calculators';
export const lessonBlockTypes = ['heading', 'subheading', 'text', 'video', 'audio', 'image', 'question', 'divider', 'link', 'prompt', 'prompt-generator', 'persona-generator', 'landing-planner', 'recipe-calculator', 'margin-calculator', 'marketing-funnel', 'quiz'] as const;
export type LessonBlockType = typeof lessonBlockTypes[number];
export type BlockField = { id: string; label: string; variable: string; placeholder: string; required: boolean; sensitive: boolean; options?: string[] };
export type BlockQuizQuestion = { id: string; prompt: string; options: string[]; correctIndex: number };
export type LessonBlock = {
  id: string; type: LessonBlockType; content?: string; url?: string; alt?: string;
  toolVersion?: string;
  question?: { label: string; kind: 'text' | 'image' | 'file'; required: boolean };
  fields?: BlockField[]; quiz?: { questions: BlockQuizQuestion[]; passPercent: number };
};
export type LessonBlockDocument = { schemaVersion: 1; blocks: LessonBlock[]; checklist: { id: string; label: string; required: boolean }[] };
export type PublicLessonBlock = Omit<LessonBlock, 'quiz'> & { quiz?: { questions: Omit<BlockQuizQuestion, 'correctIndex'>[]; passPercent: number } };
export type PublicBlockDocument = Omit<LessonBlockDocument, 'blocks'> & { blocks: PublicLessonBlock[] };
export type BlockAnswer = string | Record<string, string | number>;
export type LessonBlockAnswers = { blocks: Record<string, BlockAnswer>; checklist: string[] };
const fieldTypes = new Set<LessonBlockType>(['prompt-generator', 'persona-generator', 'landing-planner', 'recipe-calculator', 'margin-calculator', 'marketing-funnel']);
const mediaTypes = new Set<LessonBlockType>(['image', 'audio', 'video', 'link']);
function invalid(message: string): never { throw Object.assign(new Error(message), { status: 400 }); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('입력 형식을 확인해 주세요.');
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) invalid('지원하지 않는 항목이 포함돼 있습니다.');
}
function text(value: unknown, max = 20000, required = false): string {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) invalid('입력 내용의 길이와 필수 항목을 확인해 주세요.');
  return value;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value) || Object.hasOwn(Object.prototype, value) || value === 'prototype') invalid('항목 식별자를 확인해 주세요.');
  return value;
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') invalid('선택 항목을 확인해 주세요.'); return value; }
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) invalid('항목 수를 확인해 주세요.'); return value;
}
function unique(values: string[]) { if (new Set(values).size !== values.length) invalid('항목 식별자나 변수 이름이 중복됩니다.'); }
function httpsUrl(value: unknown) {
  const raw = text(value, 4000, true);
  try { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password) invalid('HTTPS 주소를 입력해 주세요.'); }
  catch { invalid('HTTPS 주소를 입력해 주세요.'); }
  return raw;
}

export function validateLessonBlocks(input: unknown): LessonBlockDocument {
  const doc = object(input); onlyKeys(doc, ['schemaVersion', 'blocks', 'checklist']);
  if (doc.schemaVersion !== 1) invalid('지원하지 않는 수업 버전입니다.');
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 2_000_000) invalid('수업 내용이 너무 큽니다. 이미지는 업로드한 주소로 등록해 주세요.');
  const blocks = array(doc.blocks, 1000).map(raw => {
    const b = object(raw), type = b.type as LessonBlockType;
    if (!lessonBlockTypes.includes(type)) invalid('지원하지 않는 수업 항목입니다.');
    const allowed = ['id', 'type', 'content'];
    if (mediaTypes.has(type)) allowed.push('url', 'alt');
    if (type === 'question') allowed.push('question');
    if (fieldTypes.has(type)) allowed.push('fields');
    if (isGuidedTool(type) || isCalculator(type)) allowed.push('toolVersion');
    if (type === 'quiz') allowed.push('quiz');
    onlyKeys(b, allowed);
    const block: LessonBlock = { id: id(b.id), type };
    if (b.toolVersion !== undefined) block.toolVersion = text(b.toolVersion, 100, true);
    if (b.content !== undefined) block.content = text(b.content, 200000);
    if (mediaTypes.has(type)) {
      block.url = httpsUrl(b.url);
      if (b.alt !== undefined) block.alt = text(b.alt, 1000);
    }
    if (type === 'question') {
      const q = object(b.question); onlyKeys(q, ['label', 'kind', 'required']);
      if (!['text', 'image', 'file'].includes(String(q.kind))) invalid('답변 유형을 확인해 주세요.');
      block.question = { label: text(q.label, 5000, true), kind: q.kind as 'text' | 'image' | 'file', required: bool(q.required) };
    }
    if (fieldTypes.has(type)) {
      block.fields = array(b.fields, 100).map(raw => {
        const f = object(raw); onlyKeys(f, ['id', 'label', 'variable', 'placeholder', 'required', 'sensitive', 'options']);
        const field: BlockField = { id: id(f.id), label: text(f.label, 1000, true), variable: text(f.variable, 100, true), placeholder: text(f.placeholder, 1000), required: bool(f.required), sensitive: bool(f.sensitive) };
        if (/[{}\r\n]/.test(field.variable)) invalid('변수 이름에는 중괄호나 줄바꿈을 넣을 수 없습니다.');
        if (f.options !== undefined) field.options = array(f.options, 100).map(option => text(option, 1000, true));
        return field;
      });
      unique(block.fields.map(f => f.id)); unique(block.fields.map(f => f.variable.replace(/\s+/g, '')));
    }
    if (isGuidedTool(type) && !hasGuidedDefinition(block)) invalid('학습 도구의 질문과 버전을 확인해 주세요.');
    if (isCalculator(type) && !hasCalculatorDefinition(block)) invalid('계산기 구성과 버전을 확인해 주세요.');
    if (type === 'quiz') {
      const quiz = object(b.quiz); onlyKeys(quiz, ['questions', 'passPercent']);
      const questions = array(quiz.questions, 100).map(raw => {
        const q = object(raw); onlyKeys(q, ['id', 'prompt', 'options', 'correctIndex']);
        const options = array(q.options, 20).map(option => text(option, 5000, true));
        if (options.length < 2 || !Number.isInteger(q.correctIndex) || Number(q.correctIndex) < 0 || Number(q.correctIndex) >= options.length) invalid('시험 선택지와 정답을 확인해 주세요.');
        return { id: id(q.id), prompt: text(q.prompt, 10000, true), options, correctIndex: Number(q.correctIndex) };
      });
      if (!questions.length || !Number.isInteger(quiz.passPercent) || Number(quiz.passPercent) < 1 || Number(quiz.passPercent) > 100) invalid('시험 문항과 통과 기준을 확인해 주세요.');
      unique(questions.map(q => q.id));
      block.quiz = { questions, passPercent: Number(quiz.passPercent) };
    }
    return block;
  });
  unique(blocks.map(b => b.id));
  const checklist = array(doc.checklist, 1000).map(raw => {
    const item = object(raw); onlyKeys(item, ['id', 'label', 'required']);
    return { id: id(item.id), label: text(item.label, 5000, true), required: bool(item.required) };
  });
  unique(checklist.map(item => item.id));
  return { schemaVersion: 1, blocks, checklist };
}

export function publicLessonBlocks(doc: LessonBlockDocument): PublicBlockDocument {
  return { ...doc, blocks: doc.blocks.map(block => {
    if (!block.quiz) return { ...block };
    return { ...block, quiz: { passPercent: block.quiz.passPercent, questions: block.quiz.questions.map(q => ({ id: q.id, prompt: q.prompt, options: [...q.options] })) } };
  }) };
}

export function validateBlockAnswers(input: unknown, doc: LessonBlockDocument): LessonBlockAnswers {
  const value = object(input); onlyKeys(value, ['blocks', 'checklist']);
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 500000) invalid('답변이 너무 깁니다.');
  const incoming = object(value.blocks), blocks: LessonBlockAnswers['blocks'] = {};
  for (const [blockId, answer] of Object.entries(incoming)) {
    const block = doc.blocks.find(b => b.id === blockId);
    if (!block) invalid('수업에 없는 질문에는 답변을 저장할 수 없습니다.');
    if (block.type === 'question' && block.question?.kind === 'text') blocks[blockId] = text(answer);
    else if (block.fields || block.quiz) {
      const values = object(answer), fields: Record<string, string | number> = {};
      for (const [key, raw] of Object.entries(values)) {
        if (block.quiz) {
          const q = block.quiz.questions.find(q => q.id === key);
          if (!q || !Number.isInteger(raw) || Number(raw) < 0 || Number(raw) >= q.options.length) invalid('시험 답변을 확인해 주세요.');
          fields[key] = Number(raw);
        } else {
          const f = block.fields?.find(f => f.id === key);
          if (!f || f.sensitive) invalid('저장할 수 없는 입력 항목입니다. 비밀값은 답변에 저장하지 마세요.');
          const answer = text(raw);
          if (f.options?.length && answer && !f.options.includes(answer)) invalid('목록에 있는 답변을 선택해 주세요.');
          fields[key] = answer;
        }
      }
      if (isCalculator(block.type)) {
        try { validateCalculatorValues(block.type, fields); } catch (error) { invalid((error as Error).message); }
      }
      blocks[blockId] = fields;
    } else invalid('해당 항목의 답변 형식을 확인해 주세요.'); // Attachments require a verified upload binding, not an arbitrary URL.
  }
  const checklist = array(value.checklist, 1000).map(key => id(key));
  unique(checklist);
  if (checklist.some(key => !doc.checklist.some(item => item.id === key))) invalid('체크리스트 항목을 확인해 주세요.');
  return { blocks, checklist };
}

export function fillBlockPrompt(template: string, fields: BlockField[], answers: Record<string, string>) {
  // One pass: replacement text containing $&, braces or another field's name
  // stays literal and is never evaluated or used as a second substitution.
  const values = new Map(fields.map(f => [f.variable.replace(/\s+/g, ''), Object.hasOwn(answers, f.id) && typeof answers[f.id] === 'string' ? answers[f.id].trim() : '']));
  return template.replace(/\{\{([^{}]+)\}\}|\{([^{}]+)\}/g, (match, double: string | undefined, single: string | undefined) => values.get((double ?? single ?? '').replace(/\s+/g, '')) || match);
}

export function gradeBlockQuiz(block: LessonBlock, answers: Record<string, string | number>) {
  if (!block.quiz) invalid('시험을 찾을 수 없습니다.');
  const results = block.quiz.questions.map(q => ({ id: q.id, answered: Object.hasOwn(answers, q.id), correct: answers[q.id] === q.correctIndex }));
  const correct = results.filter(q => q.correct).length;
  return { results, correct, total: results.length, passed: results.every(q => q.answered) && correct * 100 >= results.length * block.quiz.passPercent };
}
