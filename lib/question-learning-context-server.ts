import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from './platform';
import { curriculumDayNumbers } from './curriculum-days';

type Question = { id: string; lesson_id?: unknown; learning_context?: unknown };
const chunks = <T,>(items: T[], size = 100) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

/** Enrich already-authorized questions only. Never change their stored text or curriculum. */
export async function questionLearningContexts(db: SupabaseClient, questions: Question[]): Promise<Map<string, string>> {
  const linked = questions.filter(q => typeof q.lesson_id === 'string' && typeof q.learning_context === 'string' && / · \d+주차 · /.test(q.learning_context));
  const labels = new Map<string, string>();
  if (!linked.length) return labels;
  const targets: Row[] = [];
  for (const ids of chunks([...new Set(linked.map(q => String(q.lesson_id)))])) {
    const result = await db.from('curriculum_lessons').select('id,week_id').in('id', ids);
    if (result.error) throw result.error;
    targets.push(...(result.data || []));
  }
  if (!targets.length) return labels;
  const courses = new Set<string>();
  for (const ids of chunks([...new Set(targets.map(l => String(l.week_id)))])) {
    const result = await db.from('curriculum_weeks').select('id,course_id').in('id', ids);
    if (result.error) throw result.error;
    for (const week of result.data || []) courses.add(String(week.course_id));
  }
  const weeks: Row[] = [], lessons: Row[] = [];
  // Page lightweight metadata, including hidden lessons, as the learner day calculation does.
  // No lesson bodies, attachments, profiles, or per-question curriculum reads.
  for (const ids of chunks([...courses])) {
    for (let from = 0; ; from += 1000) {
      const result = await db.from('curriculum_weeks').select('id,course_id,week_number,archived_at').in('course_id', ids).order('id').range(from, from + 999);
      if (result.error) throw result.error;
      weeks.push(...(result.data || []));
      if ((result.data || []).length < 1000) break;
    }
  }
  for (const ids of chunks(weeks.map(w => w.id))) {
    for (let from = 0; ; from += 1000) {
      const result = await db.from('curriculum_lessons').select('id,week_id,day_number,archived_at').in('week_id', ids).order('id').range(from, from + 999);
      if (result.error) throw result.error;
      lessons.push(...(result.data || []));
      if ((result.data || []).length < 1000) break;
    }
  }
  const days = curriculumDayNumbers({ curriculum_weeks: weeks, curriculum_lessons: lessons });
  const lessonMap = new Map(lessons.map(l => [l.id, l])), weekMap = new Map(weeks.map(w => [w.id, w]));
  for (const question of linked) {
    const lesson = lessonMap.get(String(question.lesson_id)), week = lesson && weekMap.get(String(lesson.week_id));
    const day = days.get(String(question.lesson_id));
    if (!week || day === undefined) continue; // Removed curriculum keeps its historical context.
    labels.set(question.id, String(question.learning_context).replace(/ · \d+주차 · (?:\d+일차 · )?/, ` · ${Number(week.week_number)}주차 · ${day}일차 · `));
  }
  return labels;
}

/** Call only after the thread RPC has checked ownership, cohort visibility, or operator rights. */
export async function threadLearningContext(db: SupabaseClient, data: unknown): Promise<unknown> {
  const thread = data as { question?: { id?: string; learningContext?: unknown } } | null;
  if (!thread?.question?.id || typeof thread.question.learningContext !== 'string') return data;
  const result = await db.from('edu_questions').select('id,lesson_id,learning_context').eq('id', thread.question.id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return data;
  const labels = await questionLearningContexts(db, [result.data]);
  const label = labels.get(thread.question.id);
  return label ? { ...thread, question: { ...thread.question, learningContext: label } } : data;
}
