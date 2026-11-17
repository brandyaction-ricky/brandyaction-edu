import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync(new URL('../lib/curriculum-outline-draft.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outline = {};
new Function('exports', code)(outline);

const data = () => ({ curriculum_weeks: [
  { id: 'zero', course_id: 'course', week_number: 0 },
  { id: 'one', course_id: 'course', week_number: 1 },
  { id: 'other', course_id: 'other-course', week_number: 0 },
], curriculum_lessons: [{ id: 'lesson', week_id: 'zero', day_number: 15, title: '원래 제목', curriculum_day_number: 15, is_published: true }] });
const draft = { lessonId: 'lesson', weekId: 'zero', day: 2, title: '준비 수업', pending: true };

test('a week zero draft displays local order two without overwriting the published lesson', () => {
  const original = data(), before = structuredClone(original);
  const rows = outline.draftOutlineLessons(original, { lesson: draft });
  assert.equal(rows[0].day_number, 2);
  assert.equal(rows[0].curriculum_day_number, undefined);
  assert.equal(rows[0].title, '준비 수업');
  assert.equal(rows[0].is_published, true);
  assert.deepEqual(original, before);
});

test('a missing, archived or foreign course draft week keeps the lesson visible in its original week', () => {
  for (const weekId of ['missing', 'other', 'archived']) {
    const original = data();
    original.curriculum_weeks.push({ id: 'archived', course_id: 'course', archived_at: '2026-01-01' });
    assert.deepEqual(outline.draftOutlineLessons(original, { lesson: { ...draft, weekId } }), original.curriculum_lessons);
  }
});

test('compact metadata distinguishes unpublished revisions, including changed public versions, without retaining the body', () => {
  const snapshot = { lessonId: 'lesson', revision: 'draft', publishedRevision: null, publishedStamp: null,
    public: { stamp: 'public' }, payload: { form: { basic: { week_id: 'zero', day_number: '2', title: '준비 수업' }, bodyText: 'large body' }, blocks: { document: {} } } };
  assert.deepEqual(outline.outlineDraft(snapshot), draft);
  snapshot.publishedRevision = 'draft'; snapshot.publishedStamp = 'public';
  assert.equal(outline.outlineDraft(snapshot).pending, false);
  snapshot.public.stamp = 'changed-by-another-editor';
  assert.equal(outline.outlineDraft(snapshot).pending, true);
  snapshot.revision = null;
  assert.equal(outline.outlineDraft(snapshot).pending, false);
});
