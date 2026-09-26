import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/platform-rules.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { homepageCourses, hasLearningAccess, isPurchasableOffer, isRecruiting, matchingOrder, paidCourseReadinessIssues, productSalesStatus, recordId } = exports;
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

test('published paid products can sell an upcoming cohort until its actual deadline', () => {
  const course = { status: 'published', category: 'paid_class' };
  const upcoming = { status: 'upcoming', recruitment_start_at: '2026-09-28T00:00:00Z', recruitment_end_at: '2026-10-01T00:00:00Z' };
  assert.equal(isPurchasableOffer(course, upcoming, now), true);
  assert.equal(isPurchasableOffer({ ...course, status: 'draft' }, upcoming, now), false);
  assert.equal(isPurchasableOffer({ ...course, category: 'free' }, upcoming, now), false);
  assert.equal(isPurchasableOffer(course, { ...upcoming, recruitment_end_at: '2026-09-11T12:00:00Z' }, now), false);
});

test('paid products expose missing publication requirements before checkout', () => {
  const course = { id: 'course', status: 'published', category: 'paid_class', metadata: {} };
  const cohort = { course_id: 'course', status: 'recruiting', price: 100000, recruitment_end_at: '2026-10-01T00:00:00Z' };
  assert.deepEqual(paidCourseReadinessIssues(course, [cohort], [], []), ['학습 기간', '일정 안내', '공개 커리큘럼', '상세 콘텐츠']);
  assert.deepEqual(paidCourseReadinessIssues({ ...course, description: '상세', duration_label: '4주', schedule_label: '화요일' }, [cohort], [{ id: 'week', course_id: 'course', is_published: true }], [{ week_id: 'week', is_published: true }]), []);
  assert.equal(isPurchasableOffer({ ...course, status: 'draft' }, cohort, now), false);
});

test('homepage shows published courses even when no cohort has been created', () => {
  const courses = [{ id: 'new' }, { id: 'recruiting' }];
  const cohorts = [{ course_id: 'recruiting', status: 'recruiting' }];
  assert.deepEqual(homepageCourses(courses, cohorts, now).map(course => course.id), ['recruiting', 'new']);
  assert.deepEqual(homepageCourses([{ id: 'new' }], [], now).map(course => course.id), ['new']);
});

test('admin effective sales status mirrors customer readiness and offer rules without changing them', () => {
  const course = { id: 'course', status: 'published', category: 'paid_class', description: '상세', duration_label: '4주', schedule_label: '화요일' };
  const cohort = { id: 'cohort', course_id: 'course', status: 'upcoming', price: 100000, recruitment_end_at: '2026-10-01T00:00:00Z' };
  const weeks = [{ id: 'week', course_id: 'course', is_published: true }];
  const lessons = [{ id: 'lesson', week_id: 'week', is_published: true }];
  const inspect = (cohorts, w = weeks, l = lessons, c = course) => productSalesStatus(c, cohorts, w, l, now);
  assert.equal(inspect([cohort]).label, '판매 중');
  assert.equal(inspect([cohort]).canApply, true, 'upcoming with a future deadline stays purchasable');
  assert.equal(inspect([cohort], [], []).label, '판매 보류');
  assert.deepEqual(inspect([cohort], [], []).issues, ['공개 커리큘럼']);
  for (const status of ['closed', 'completed', 'cancelled', 'in_progress']) {
    assert.equal(inspect([{ ...cohort, status }]).canApply, false);
    assert.match(inspect([{ ...cohort, status }]).issues.join(), /기수 상태와 모집·운영 기간/);
  }
  assert.equal(inspect([{ ...cohort, recruitment_end_at: '2026-09-11T12:00:00Z' }]).canApply, false);
  assert.equal(inspect([{ ...cohort, course_id: 'other' }]).canApply, false);
  assert.equal(inspect([{ ...cohort, status: 'closed' }, { ...cohort, id: 'open', status: 'recruiting' }]).available.id, 'open');
  assert.equal(inspect([], weeks, lessons, { ...course, category: 'free' }).label, '판매 중');
  assert.equal(inspect([cohort], weeks, lessons, { ...course, status: 'draft' }).label, '작성 중');
  assert.equal(productSalesStatus(course, [{ ...cohort, status: 'closed' }], weeks, lessons, now, true).label, '판매 중', 'custom CTA still opens its configured destination');
  assert.equal(productSalesStatus(course, [cohort], [], [], now, true).label, '판매 보류', 'custom CTA does not bypass missing content');
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
