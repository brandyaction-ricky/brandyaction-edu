import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setup } from './helpers/interactive-curriculum-copy.mjs';

const archive = readFileSync(new URL('../supabase/migrations/20260929120000_product_curriculum_archive.sql', import.meta.url), 'utf8');

for (const kind of ['lesson', 'week']) {
  test(`archiving and restoring a ${kind} preserves interactive answers, reviews and progress`, async t => {
    const f = await setup(t);
    await f.owner(archive);
    await f.draft();
    const submission = await f.submit();
    await f.rpc('edu_decide_lesson_blocks', [f.admin, submission.id, submission.stateId, randomUUID(), 'approved', '검토 완료']);
    const read = () => f.rpc('edu_read_lesson_blocks', [f.student, f.lessonId, f.enrollment, null]);
    const before = await read();
    const snapshot = async () => (await f.db.query(`select
      (select jsonb_agg(to_jsonb(d)) from edu_lesson_block_drafts d) as drafts,
      (select jsonb_agg(to_jsonb(s)) from edu_lesson_block_submissions s) as submissions,
      (select jsonb_agg(to_jsonb(r)) from edu_lesson_block_reviews r) as reviews,
      (select jsonb_agg(to_jsonb(p)) from lesson_progress p) as progress`)).rows[0];
    const records = await snapshot();
    await f.rpc('edu_set_curriculum_archive', [f.admin, f.course, kind, kind === 'week' ? f.week : f.lessonId, true]);
    await assert.rejects(read(), /BLOCK_NOT_FOUND/);
    assert.deepEqual(await snapshot(), records);
    if (kind === 'week') {
      await f.rpc('edu_set_curriculum_archive', [f.admin, f.course, 'week', f.week, false]);
      await assert.rejects(read(), /BLOCK_NOT_FOUND/);
    }
    await f.rpc('edu_set_curriculum_archive', [f.admin, f.course, 'lesson', f.lessonId, false]);
    await assert.rejects(read(), /BLOCK_FORBIDDEN/);
    await f.db.query('update curriculum_weeks set is_published=true where id=$1', [f.week]);
    await f.db.query('update curriculum_lessons set is_published=true where id=$1', [f.lessonId]);
    assert.deepEqual(await read(), before);
    assert.deepEqual(await snapshot(), records);
  });
}
