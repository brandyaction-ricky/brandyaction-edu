import { lessonBlockTypes, type LessonBlockDocument } from './lesson-blocks';
import type { LessonWriterCheckpoint } from './lesson-block-authoring';

export type LearningBasicDraft = { week_id: string; day_number: string; title: string; description: string; duration_label: string; is_published: boolean; is_preview: boolean };
export type LearningFormDraft = { basic: LearningBasicDraft; format: 'text' | 'vod' | 'material' | 'link'; bodyText: string; videoUrl: string; externalUrl: string; resourceName: string; resourcePath: string };
export type BlockEditorDraft = { active: boolean; document: LessonBlockDocument; writer: LessonWriterCheckpoint };
export type LearningEditorDraft = { version: 1; actorId: string; scopeLessonId: string; storedLessonId: string; savedAt: string; base: LearningFormDraft; form: LearningFormDraft; blocks: BlockEditorDraft };
const limit = 4_000_000;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const bool = (v: unknown) => typeof v === 'boolean';
const optionalString = (v: unknown) => v === undefined || str(v);
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const identity = (v: unknown) => str(v) && /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(v) && !Object.hasOwn(Object.prototype, v) && v !== 'prototype';
function list(v: unknown, max: number, check: (v: unknown) => boolean): boolean { return Array.isArray(v) && v.length <= max && v.every(check); }
function uniqueIds(v: { id: string }[]) { return new Set(v.map(x => x.id)).size === v.length; }

// Drafts deliberately accept unfinished required fields. Publishing continues
// to use validateLessonBlocks; restoring only verifies safe editor structure.
export function isBlockEditorDocument(v: unknown): v is LessonBlockDocument {
  if (!obj(v) || !only(v, ['schemaVersion', 'blocks', 'checklist', 'completion', 'progression', 'presentation']) || v.schemaVersion !== 1 || !list(v.blocks, 1000, b => {
    if (!obj(b) || !identity(b.id) || !lessonBlockTypes.includes(b.type as never) || !['content', 'url', 'assetId', 'alt', 'toolVersion'].every(k => optionalString(b[k]))) return false;
    const allowed = ['id', 'type', 'content'];
    if (['image', 'audio', 'video', 'link'].includes(String(b.type))) allowed.push('url', 'alt');
    if (['image', 'audio', 'video'].includes(String(b.type))) allowed.push('assetId');
    if (b.type === 'question') allowed.push('question');
    if (['prompt-generator', 'persona-generator', 'landing-planner', 'recipe-calculator', 'margin-calculator', 'marketing-funnel'].includes(String(b.type))) allowed.push('fields');
    if (['persona-generator', 'landing-planner', 'recipe-calculator', 'margin-calculator', 'marketing-funnel'].includes(String(b.type))) allowed.push('toolVersion');
    if (b.type === 'quiz') allowed.push('quiz');
    if (!only(b, allowed)) return false;
    if (b.type === 'question' && (!obj(b.question) || !str(b.question.label) || !['text', 'image', 'file'].includes(String(b.question.kind)) || !bool(b.question.required))) return false;
    if (['prompt-generator', 'persona-generator', 'landing-planner', 'recipe-calculator', 'margin-calculator', 'marketing-funnel'].includes(String(b.type)) && !list(b.fields, 100, f => obj(f) && identity(f.id) && ['label', 'variable', 'placeholder'].every(k => str(f[k])) && bool(f.required) && bool(f.sensitive) && (f.options === undefined || list(f.options, 100, str)))) return false;
    if (b.type === 'quiz' && (!obj(b.quiz) || !Number.isFinite(b.quiz.passPercent) || !list(b.quiz.questions, 100, q => obj(q) && identity(q.id) && str(q.prompt) && list(q.options, 20, str) && Number.isInteger(q.correctIndex)))) return false;
    return true;
  }) || !list(v.checklist, 1000, c => obj(c) && identity(c.id) && str(c.label) && bool(c.required))) return false;
  if (v.completion !== undefined && (!obj(v.completion) || !['self', 'mentor'].includes(String(v.completion.mode)) || !bool(v.completion.requireAnswers) || !bool(v.completion.requireQuizPass))) return false;
  if (v.progression !== undefined && (!obj(v.progression) || !['daily', 'learning'].includes(String(v.progression.track)) || !Number.isFinite(v.progression.dayNumber))) return false;
  if (v.presentation !== undefined && (!obj(v.presentation) || !only(v.presentation, ['tag', 'tagLabel']) || !str(v.presentation.tag) || !str(v.presentation.tagLabel))) return false;
  return uniqueIds(v.blocks as { id: string }[]) && uniqueIds(v.checklist as { id: string }[]);
}
function isForm(v: unknown): v is LearningFormDraft {
  return obj(v) && only(v, ['basic', 'format', 'bodyText', 'videoUrl', 'externalUrl', 'resourceName', 'resourcePath']) && obj(v.basic) && only(v.basic, ['week_id', 'day_number', 'title', 'description', 'duration_label', 'is_published', 'is_preview']) && ['week_id', 'day_number', 'title', 'description', 'duration_label'].every(k => str((v.basic as Record<string, unknown>)[k])) && bool(v.basic.is_published) && bool(v.basic.is_preview) && ['text', 'vod', 'material', 'link'].includes(String(v.format)) && ['bodyText', 'videoUrl', 'externalUrl', 'resourceName', 'resourcePath'].every(k => str(v[k]));
}
function checkpoint(v: unknown): v is LessonWriterCheckpoint {
  if (!obj(v) || (v.revision !== null && !uuid(v.revision)) || (v.committed !== null && !isBlockEditorDocument(v.committed))) return false;
  const p = v.pending;
  return p === null || (obj(p) && p.action === 'document' && uuid(p.lessonId) && uuid(p.requestId) && p.expectedRevision === v.revision && isBlockEditorDocument(p.document));
}
export function parseLearningEditorDraft(raw: string, actorId: string, scopeLessonId: string): LearningEditorDraft {
  if (raw.length > limit) throw new Error('임시저장본이 너무 큽니다. 내려받아 확인해 주세요.');
  let v: unknown;
  try { v = JSON.parse(raw); } catch { throw new Error('임시저장본을 읽지 못했습니다. 내려받아 확인해 주세요.'); }
  if (!obj(v) || v.version !== 1 || v.actorId !== actorId || !uuid(v.actorId) || v.scopeLessonId !== scopeLessonId || (v.scopeLessonId !== '' && !uuid(v.scopeLessonId)) || (v.storedLessonId !== '' && !uuid(v.storedLessonId)) || !str(v.savedAt) || !Number.isFinite(Date.parse(v.savedAt)) || !isForm(v.base) || !isForm(v.form) || !obj(v.blocks) || !bool(v.blocks.active) || !isBlockEditorDocument(v.blocks.document) || !checkpoint(v.blocks.writer)) throw new Error('임시저장본의 계정·학습·형식을 확인할 수 없습니다. 내려받아 확인해 주세요.');
  if (v.scopeLessonId && v.storedLessonId !== v.scopeLessonId) throw new Error('다른 학습의 임시저장본입니다.');
  return v as LearningEditorDraft;
}
export function learningDraftKey(actorId: string, lessonId: string) {
  if (!uuid(actorId) || (lessonId !== '' && !uuid(lessonId))) throw new Error('임시저장할 계정과 학습을 확인하지 못했습니다.');
  return `edu:learning-author:v1:${actorId}:${lessonId || 'new'}`;
}
export class LearningDraftStore {
  private seen: string | null;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, readonly key: string) { this.seen = storage.getItem(key); }
  read() { return this.seen; }
  private unchanged() { if (this.storage.getItem(this.key) !== this.seen) throw new Error('다른 창에서 임시저장본을 변경했습니다. 이 창의 편집 내용을 내려받아 보관해 주세요.'); }
  write(draft: LearningEditorDraft) {
    const raw = JSON.stringify(draft);
    if (new TextEncoder().encode(raw).byteLength > limit) throw new Error('편집 내용이 커서 브라우저에 임시저장할 수 없습니다. 내려받아 보관해 주세요.');
    this.unchanged(); this.storage.setItem(this.key, raw); this.seen = raw; return draft.savedAt;
  }
  clear() { this.unchanged(); this.storage.removeItem(this.key); this.seen = null; }
}
