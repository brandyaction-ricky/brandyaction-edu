import { lessonBodyPlainText } from '@/lib/lesson-body';
import { publicLessonBlocks, validateLessonBlocks } from '@/lib/lesson-blocks';

export type LessonSearchHit = { lessonId: string; excerpt: string };
type Row = Record<string, unknown>;
type Db = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Plain text a learner can read in one lesson: block text, prompts, questions and checklist. */
export function lessonSearchText(document: unknown, legacyBody = '') {
  try {
    const doc = publicLessonBlocks(validateLessonBlocks(document, { checkReferences: false }));
    const lines: string[] = [];
    for (const b of doc.blocks) {
      if (b.content) lines.push(lessonBodyPlainText(b.content));
      if (b.question) lines.push(b.question.label);
      for (const f of b.fields || []) lines.push(f.label, f.placeholder);
      for (const q of b.quiz?.questions || []) lines.push(q.prompt);
      if (b.alt) lines.push(b.alt);
    }
    for (const c of doc.checklist) lines.push(c.label);
    return lines.join('\n');
  } catch { return lessonBodyPlainText(legacyBody); }
}

/** Title hits outrank body hits; the excerpt shows where in the lesson the first word appears. */
export function searchLessons(lessons: { id: string; title: string; day: number; text: string }[], query: string): LessonSearchHit[] {
  const terms = query.toLowerCase().split(/[\s,]+/).filter(t => t.length >= 2).slice(0, 5);
  if (!terms.length) return [];
  return lessons.map(l => {
    const title = l.title.toLowerCase(), body = l.text.toLowerCase();
    const score = terms.reduce((n, t) => n + (title.includes(t) ? 3 : 0) + (body.includes(t) ? 1 : 0), 0);
    const at = Math.min(...terms.map(t => body.indexOf(t)).filter(i => i >= 0), Infinity);
    const excerpt = Number.isFinite(at) ? (at > 40 ? '…' : '') + l.text.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, ' ').trim() + '…' : '';
    return { lessonId: l.id, excerpt, score, day: l.day };
  }).filter(h => h.score > 0).sort((a, b) => b.score - a.score || a.day - b.day).slice(0, 8).map(({ lessonId, excerpt }) => ({ lessonId, excerpt }));
}

/** `lessons` must already be the lessons this learner's cohort can see; the elevated client only reads their text. */
export async function loadLessonTexts(db: Db, lessons: { id: string; title: string; day: number }[]) {
  if (!lessons.length) return [];
  const ids = lessons.map(l => l.id);
  const rows = async (q: PromiseLike<{ data: Row[] | null; error: unknown }>) => { const r = await q; if (r.error) throw r.error; return r.data || []; };
  const heads = await rows(db.from('edu_lesson_block_heads').select('lesson_id,revision').in('lesson_id', ids));
  const [versions, legacy] = await Promise.all([
    heads.length ? rows(db.from('edu_lesson_block_versions').select('id,lesson_id,document').in('id', heads.map(h => h.revision))) : [],
    rows(db.from('lesson_contents').select('lesson_id,body_text').in('lesson_id', ids)),
  ]);
  return lessons.map(l => ({ ...l, text: lessonSearchText(versions.find(v => v.lesson_id === l.id)?.document, String(legacy.find(v => v.lesson_id === l.id)?.body_text || '')) }));
}
