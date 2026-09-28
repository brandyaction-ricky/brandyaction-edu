import type { Row } from './platform';
import { hasLearningAccess } from './platform-rules';

export type LessonGate = { lessonId: string; isUnlocked: boolean; automaticApproval: boolean; ongoing?: boolean; track: 'daily' | 'learning' | null; dayNumber: number | null; reason: string };
export type LearningItem = { id: string; title: string; day: number; week: number; done: boolean; unlocked: boolean; reason: string };
export type LearningGroup = { key: 'daily' | 'learning' | 'other' | 'ongoing'; title: string; items: LearningItem[]; completed: number; next?: LearningItem; review?: LearningItem };
export type LearningOverview = { status: 'ready'; groups: LearningGroup[] } | { status: 'error' | 'inactive'; groups: [] };

// The UI only receives the gate fields. Never forward future RPC additions
// such as answer keys or private lesson documents through this read path.
export function parseLessonGates(value: unknown): LessonGate[] {
  const invalid = () => { throw new Error('학습 진행 상태를 확인하지 못했습니다.'); };
  if (!Array.isArray(value) || value.length > 200) return invalid();
  const seen = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
    const row = raw as Record<string, unknown>;
    if (typeof row.lessonId !== 'string' || !row.lessonId || seen.has(row.lessonId) ||
      typeof row.isUnlocked !== 'boolean' || typeof row.automaticApproval !== 'boolean' ||
      typeof row.reason !== 'string' || row.reason.length > 1000 ||
      ![null, 'daily', 'learning'].includes(row.track as string | null) ||
      (row.ongoing !== undefined && typeof row.ongoing !== 'boolean') ||
      (row.track === null ? row.dayNumber !== null : !Number.isInteger(row.dayNumber) || Number(row.dayNumber) < 1 || Number(row.dayNumber) > 30) ||
      (row.ongoing === true && row.track !== null)) return invalid();
    seen.add(row.lessonId);
    return { lessonId: row.lessonId, isUnlocked: row.isUnlocked, automaticApproval: row.automaticApproval, track: row.track as LessonGate['track'], dayNumber: row.dayNumber as number | null, reason: row.reason, ...(row.ongoing === true ? { ongoing: true } : {}) };
  });
}

export function learningOverview(data: Record<string, Row[]>, enrollment: Row): LearningOverview {
  if (!hasLearningAccess(enrollment)) return { status: 'inactive', groups: [] };
  const record = data.learning_overviews?.find(row => row.id === enrollment.id);
  if (record?.status !== 'ready') return { status: 'error', groups: [] };
  let gates: LessonGate[];
  try { gates = parseLessonGates(record.lessons); } catch { return { status: 'error', groups: [] }; }
  const weeks = new Map((data.curriculum_weeks || []).filter(row => row.course_id === enrollment.course_id && row.is_published !== false && !row.archived_at).map(row => [row.id, row]));
  const lessons = new Map((data.curriculum_lessons || []).filter(row => weeks.has(String(row.week_id)) && row.is_published !== false && !row.archived_at).map(row => [row.id, row]));
  const completed = new Set((data.lesson_progress || []).filter(row => row.enrollment_id === enrollment.id && row.completed_at).map(row => String(row.lesson_id)));
  const groups: LearningGroup[] = [
    { key: 'daily', title: '데일리 미션', items: [], completed: 0 },
    { key: 'learning', title: '학습 & 시험', items: [], completed: 0 },
    { key: 'other', title: '일반 학습', items: [], completed: 0 },
    { key: 'ongoing', title: '지속 챌린지', items: [], completed: 0 },
  ];
  for (const gate of gates) {
    const lesson = lessons.get(gate.lessonId);
    if (!lesson) continue;
    const group = groups.find(group => group.key === (gate.ongoing ? 'ongoing' : gate.track || 'other'))!;
    const day = gate.dayNumber ?? (Number(lesson.day_number) || 0);
    group.items.push({ id: gate.lessonId, title: String(lesson.title || '학습'), day, week: gate.track ? Math.ceil(day / 5) : Number(weeks.get(String(lesson.week_id))?.week_number) || 0, done: !gate.ongoing && completed.has(gate.lessonId), unlocked: gate.isUnlocked, reason: gate.reason });
  }
  for (const group of groups) {
    group.items.sort((a, b) => a.week - b.week || a.day - b.day || a.id.localeCompare(b.id));
    group.completed = group.items.filter(item => item.done).length;
    group.next = group.items.find(item => item.unlocked && !item.done);
    group.review = group.items.findLast(item => item.unlocked && item.done);
  }
  return { status: 'ready', groups: groups.filter(group => group.items.length) };
}

// A small worker pool avoids one unbounded RPC fan-out for members enrolled
// in many classes. Each class can fail independently without becoming open.
export async function readLearningOverviews(ids: string[], read: (id: string) => Promise<unknown>): Promise<Row[]> {
  const unique = [...new Set(ids)], result: Row[] = new Array(unique.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= unique.length) return;
      const id = unique[index];
      try { result[index] = { id, status: 'ready', lessons: parseLessonGates(await read(id)) }; }
      catch { result[index] = { id, status: 'error' }; }
    }
  }));
  return result;
}
