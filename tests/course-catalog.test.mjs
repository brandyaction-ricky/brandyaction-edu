import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const catalogModule = { exports: {} };
new Function('module', 'exports', buildSync({ entryPoints: ['lib/course-catalog.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text)(catalogModule, catalogModule.exports);
const { courseAvailability, courseSchedule, sortedCatalog, catalogTitle, catalogCounts } = catalogModule.exports;
const paid = { id: 'paid', category: 'paid_class', list_price: 10000 };
const end = Date.parse('2026-11-05T14:59:00Z');
const cohort = { id: 'cohort', course_id: 'paid', status: 'recruiting', recruitment_end_at: new Date(end).toISOString() };

test('card availability respects the exact deadline and KST day, independent of stale recruiting status', () => {
  assert.equal(courseAvailability(paid, [cohort], end - 1).label, '모집 중 · 오늘 마감');
  assert.equal(courseAvailability(paid, [cohort], end).state, 'closed');
  assert.equal(courseAvailability(paid, [cohort], end + 1).state, 'closed');
  assert.equal(courseAvailability(paid, [cohort], Date.parse('2026-11-04T14:59:00Z')).label, '모집 중 · D-1');
  assert.equal(courseAvailability(paid, [cohort], Date.parse('2026-11-04T15:00:00Z')).label, '모집 중 · 오늘 마감');
});
test('another recruiting cohort wins over expired cohorts; archived/cancelled/invalid are never open', () => {
  const open = { ...cohort, id: 'open', recruitment_end_at: '2027-01-01T00:00:00Z' };
  assert.equal(courseAvailability(paid, [cohort, open], end).cohort.id, 'open');
  for (const change of [{ archived_at: '2026-01-01' }, { status: 'cancelled' }, { recruitment_end_at: 'bad' }, { operation_end_at: '2026-01-01' }]) {
    assert.notEqual(courseAvailability(paid, [{ ...open, ...change }], end).state, 'open');
  }
  assert.equal(courseAvailability(paid, [{ ...cohort, recruitment_end_at: null }], end).label, '모집 중');
  assert.equal(courseAvailability(paid, [], end).state, 'unknown');
});
test('future recruitment is labeled upcoming without changing purchase authorization', () => {
  assert.equal(courseAvailability(paid, [{ ...cohort, status: 'upcoming', recruitment_start_at: '2026-11-05T01:00:00Z' }], Date.parse('2026-11-01')).state, 'upcoming');
});
test('schedule uses only stored copy or selected cohort date in Korea time', () => {
  assert.equal(courseSchedule(paid, [], end), '');
  assert.equal(courseSchedule({ ...paid, schedule_label: '일정 협의' }, [cohort], end), '일정 협의');
  const schedule = courseSchedule(paid, [{ ...cohort, operation_start_at: '2026-11-05T12:00:00Z' }], end - 1);
  assert.match(schedule, /21:00/);
  assert.doesNotMatch(schedule, /다시보기|2시간|라이브/);
});
test('sorting preserves display order within groups and never mutates input; counts match public product types', () => {
  const courses = [paid, { id: 'unknown', list_price: 0 }, { id: 'open', list_price: 0 }, { id: 'digital', list_price: 0, metadata: { productType: 'digital' } }];
  const cohorts = [cohort, { ...cohort, course_id: 'open', recruitment_end_at: null }];
  assert.deepEqual(sortedCatalog(courses, cohorts, end).map(c => c.id), ['open', 'digital', 'unknown', 'paid']);
  assert.equal(courses[0].id, 'paid');
  assert.deepEqual(catalogCounts(courses), { free: 2, paid: 1, digital: 1 });
});
test('public title suppresses only the operational suffix, without deduplicating or changing records', () => {
  const c = { id: 'one', title: 'AI 직원 자동화 (오가닉)', slug: 'organic' };
  assert.equal(catalogTitle(c), 'AI 직원 자동화');
  assert.equal(c.title, 'AI 직원 자동화 (오가닉)');
  assert.equal(c.slug, 'organic');
});
