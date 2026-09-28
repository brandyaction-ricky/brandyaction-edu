import type { OngoingCadence } from './ongoing-lessons';
import { validateLessonBlocks, type LessonBlockDocument } from './lesson-blocks';

export const lessonImportLimit = 4_000_000;
export type ImportWeek = { id: string; number: number; title: string; goal: string; existing: boolean };
export type ImportLesson = { ongoing?: OngoingCadence; id: string; revision: string; sourceKey: string; weekId: string; order: number; title: string; description: string; durationLabel: string; provenance: Record<string, unknown>; document: LessonBlockDocument };
export type ImportMedia = { assetId: string; kind: 'image' | 'audio' | 'video'; sha256: string; bytes: number; mimeType: string };
export type LessonImportBatch = { formatVersion: 1; courseId: string; sourceDigest: string; sourceCapturedAt: string; weeks: ImportWeek[]; lessons: ImportLesson[]; media: ImportMedia[] };
export type LessonImportReceipt = { requestId: string; applied: boolean; weeksCreated: number; lessonsCreated: number; daily: number; learning: number; ongoing?: number; lessons: { sourceKey: string; lessonId: string; revision: string }[] };
const invalid = (): never => { throw new Error('가져올 커리큘럼 파일의 형식과 배치를 확인해 주세요.'); };
function record(value: unknown, keys?: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (keys && Object.keys(row).some(key => !keys.includes(key))) invalid();
  return row;
}
function text(value: unknown, max: number, required = false) { if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || value.includes('\u0000')) invalid(); return value as string; }
function id(value: unknown) { const v = text(value, 36); if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)) invalid(); return v; }
function hash(value: unknown) { const v = text(value, 64); if (!/^[a-f0-9]{64}$/.test(v)) invalid(); return v; }
function positive(value: unknown, max: number) { if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > max) invalid(); return Number(value); }
function list(value: unknown, max: number) { if (!Array.isArray(value) || value.length > max) invalid(); return value as unknown[]; }
function unique(values: unknown[]) { if (new Set(values).size !== values.length) invalid(); }

// The upload contains content, not executable source. Freshness is shown to the
// author; an offline file cannot prove that it matches today's source website.
export function validateLessonImportBatch(input: unknown): LessonImportBatch {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > lessonImportLimit) invalid();
  const root = record(input, ['formatVersion', 'courseId', 'sourceDigest', 'sourceCapturedAt', 'weeks', 'lessons', 'media']);
  if (root.formatVersion !== 1) invalid();
  const courseId = id(root.courseId), sourceDigest = hash(root.sourceDigest), sourceCapturedAt = text(root.sourceCapturedAt, 50, true);
  if (!/^\d{4}-\d\d-\d\dT/.test(sourceCapturedAt) || !Number.isFinite(Date.parse(sourceCapturedAt))) invalid();
  const weeks = list(root.weeks, 100).map(value => {
    const w = record(value, ['id', 'number', 'title', 'goal', 'existing']);
    if (typeof w.existing !== 'boolean') invalid();
    return { id: id(w.id), number: positive(w.number, 10000), title: text(w.title, 300, true), goal: text(w.goal, 10000), existing: w.existing as boolean };
  });
  unique(weeks.map(w => w.id)); unique(weeks.map(w => w.number));
  const weekIds = new Set(weeks.map(w => w.id));
  const lessons = list(root.lessons, 200).map(value => {
    const l = record(value, ['id', 'revision', 'sourceKey', 'weekId', 'order', 'title', 'description', 'durationLabel', 'provenance', 'document', 'ongoing']);
    const document = validateLessonBlocks(l.document), weekId = id(l.weekId);
    const ongoing = l.ongoing as OngoingCadence | undefined;
    if (Object.hasOwn(l, 'ongoing') && !['daily', 'weekly', 'monthly'].includes(String(ongoing))) invalid();
    if (!weekIds.has(weekId) || (ongoing ? Boolean(document.progression) || document.completion?.mode !== 'self' : !document.progression)) invalid();
    const provenance = record(l.provenance, ['metadata', 'mapping', 'checklistMapping', 'sourceWeek', 'sourceDay']);
    if (new TextEncoder().encode(JSON.stringify(provenance)).byteLength > 300000) invalid();
    return { ...(ongoing ? { ongoing } : {}), id: id(l.id), revision: id(l.revision), sourceKey: text(l.sourceKey, 200, true), weekId, order: positive(l.order, 100000), title: text(l.title, 300, true), description: text(l.description, 10000), durationLabel: text(l.durationLabel, 100), provenance, document };
  });
  if (!weeks.length || !lessons.length || weeks.some(w => !lessons.some(l => l.weekId === w.id))) invalid();
  unique(lessons.map(l => l.id)); unique(lessons.map(l => l.revision)); unique(lessons.map(l => l.sourceKey)); unique(lessons.map(l => `${l.weekId}:${l.order}`));
  unique(lessons.filter(l => l.document.progression).map(l => `${l.document.progression!.track}:${l.document.progression!.dayNumber}`));
  const media = list(root.media, 2000).map(value => {
    const m = record(value, ['assetId', 'kind', 'sha256', 'bytes', 'mimeType']);
    if (!['image', 'audio', 'video'].includes(String(m.kind))) invalid();
    return { assetId: id(m.assetId), kind: m.kind as ImportMedia['kind'], sha256: hash(m.sha256), bytes: positive(m.bytes, 50 * 1024 * 1024), mimeType: text(m.mimeType, 100, true) };
  });
  unique(media.map(m => m.assetId));
  const used = lessons.flatMap(l => l.document.blocks.filter(b => b.assetId).map(b => ({ id: b.assetId, kind: b.type })));
  if (used.some(b => !media.some(m => m.assetId === b.id && m.kind === b.kind)) || media.some(m => !used.some(b => b.id === m.assetId))) invalid();
  return { formatVersion: 1, courseId, sourceDigest, sourceCapturedAt, weeks, lessons, media };
}
