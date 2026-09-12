import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/platform-rules.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { homepageCourses, hasLearningAccess, isRecruiting, matchingOrder, recordId } = exports;
const now = Date.parse('2026-09-11T12:00:00Z');

test('learning access closes at expiry, before release, and after revocation', () => {
  const active = { id: 'course', status: 'active', access_starts_at: '2026-09-10T12:00:00Z' };
  assert.equal(hasLearningAccess(active, now), true);
  for (const patch of [
    { status: 'refunded' }, { revoked_at: '2026-09-11T10:00:00Z' },
    { access_starts_at: '2026-09-12T12:00:00Z' }, { access_ends_at: '2026-09-11T12:00:00Z' },
    { access_ends_at: 'invalid' },
  ]) assert.equal(hasLearningAccess({ ...active, ...patch }, now), false);
});

test('scheduled recruitment opens and closes at the stored boundaries', () => {
  const cohort = { id: 'cohort', status: 'upcoming', recruitment_start_at: '2026-09-11T12:00:00Z', recruitment_end_at: '2026-09-12T12:00:00Z' };
  assert.equal(isRecruiting(cohort, now), true);
  assert.equal(isRecruiting(cohort, now - 1), false);
  assert.equal(isRecruiting(cohort, now + 86400000), false);
  assert.equal(isRecruiting({ ...cohort, status: 'closed' }, now), false);
  assert.equal(isRecruiting({ ...cohort, operation_end_at: '2026-09-11T00:00:00Z' }, now), false);
});

test('homepage shows published courses even when no cohort has been created', () => {
  const courses = [{ id: 'new' }, { id: 'recruiting' }];
  const cohorts = [{ course_id: 'recruiting', status: 'recruiting' }];
  assert.deepEqual(homepageCourses(courses, cohorts, now).map(course => course.id), ['recruiting', 'new']);
  assert.deepEqual(homepageCourses([{ id: 'new' }], [], now).map(course => course.id), ['new']);
});

test('a previous paid order does not make another checkout successful', () => {
  const orders = [{ id: 'old', order_number: 'BAE-OLD', status: 'paid' }, { id: 'new', order_number: 'BAE-NEW', status: 'pending' }];
  assert.equal(matchingOrder(orders, 'BAE-NEW').status, 'pending');
  assert.equal(matchingOrder(orders, 'missing'), undefined);
  assert.equal(matchingOrder(orders, null), undefined);
  assert.equal(matchingOrder(orders, 'old').status, 'paid');
});

test('editing resources and settings targets their actual primary keys', () => {
  assert.equal(recordId({ lesson_id: 'lesson-1' }), 'lesson-1');
  assert.equal(recordId({ key: 'edu_site' }), 'edu_site');
  assert.equal(recordId({ id: 'course-1' }), 'course-1');
});
