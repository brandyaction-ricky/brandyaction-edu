import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../features/campus/learner-metrics.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const { learnerMetrics } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const mission = (id, status, required = true) => ({ id, title: id, version: 'v1', status, required, href: `/mission/${id}` });
const lesson = (id, day, missions = [], completed = false) => ({ id, day, title: `수업 ${day}`, missions, completed, version: 'v1', href: `/learn/${id}` });
const snapshot = lessons => ({ schemaVersion: 1, fetchedAt: '2026-11-02T15:10:00Z', viewer: { id: 'me', displayName: '동료' },
  scopes: [{ enrollmentId: 'enrolled', courseId: 'course', cohortId: 'cohort', courseTitle: '문샷', cohortName: '3기' }],
  selectedEnrollmentId: 'enrolled', lessons, links: { classes: '/my/classes', questions: '/my/questions' }, launchEligibility: null });

test('empty curriculum has no false completion percentage or milestones', () => {
  const result = learnerMetrics(snapshot([]));
  assert.equal(result.approvalPercent, null);
  assert.equal(result.totalRequired, 0);
  assert.equal(result.totalLessons, 0);
  assert.deepEqual(result.nextActions, []);
  assert.ok(result.milestones.every(m => !m.earned));
  assert.match(result.reportText, /필수 미션 없음/);
});

test('optional approvals never inflate required mission results', () => {
  const result = learnerMetrics(snapshot([lesson('l1', 1, [mission('optional', 'approved', false), mission('required', 'not_started')], true)]));
  assert.equal(result.approvedRequired, 0);
  assert.equal(result.totalRequired, 1);
  assert.equal(result.approvalPercent, 0);
  assert.ok(result.milestones.every(m => !m.earned));
});

test('next actions prioritize revisions, then required submissions, then incomplete lessons', () => {
  const input = snapshot([
    lesson('l1', 1, [mission('m1', 'not_started')]),
    lesson('l3', 3, [mission('m3', 'changes_requested')]),
    lesson('l2', 2, [mission('m2', 'rejected', false)]),
    lesson('l4', 4, [mission('m4', 'submitted')], true),
  ]);
  const result = learnerMetrics(input);
  assert.deepEqual(result.nextActions.map(a => [a.kind, a.day]), [
    ['revision', 2], ['revision', 3], ['start_mission', 1], ['continue_lesson', 1], ['continue_lesson', 2], ['continue_lesson', 3],
  ]);
  assert.equal(result.submittedCount, 1);
  assert.equal(result.revisionCount, 2);
  assert.equal(result.steps.find(s => s.lessonId === 'l4').status, 'waiting');
  assert.ok(!JSON.stringify(result).includes('지연'));
  assert.ok(!JSON.stringify(result).includes('overdue'));
});

test('latest submitted status is waiting and cannot count as approved', () => {
  const result = learnerMetrics(snapshot([lesson('l1', 1, [mission('m1', 'submitted')], true)]));
  assert.equal(result.approvedRequired, 0);
  assert.equal(result.nextActions.length, 0);
  assert.equal(result.steps[0].status, 'waiting');
  assert.ok(result.milestones.every(m => !m.earned));
});

test('odd denominator requires ceiling at halfway and all milestones reflect actual approval', () => {
  const data = snapshot([lesson('l1', 1, [mission('a', 'approved'), mission('b', 'not_started'), mission('c', 'not_started')])]);
  let result = learnerMetrics(data);
  assert.deepEqual(result.milestones.map(m => m.earned), [true, false, false]);
  assert.equal(result.approvalPercent, 33);
  data.lessons[0].missions[1].status = 'approved';
  result = learnerMetrics(data);
  assert.deepEqual(result.milestones.map(m => m.earned), [true, true, false]);
  data.lessons[0].missions[2].status = 'approved';
  assert.deepEqual(learnerMetrics(data).milestones.map(m => m.earned), [true, true, true]);
});

test('unknown status disables milestone claims and marks affected lesson', () => {
  const result = learnerMetrics(snapshot([lesson('l1', 1, [mission('a', 'approved'), mission('b', 'unknown', false)], true)]));
  assert.equal(result.unknownCount, 1);
  assert.ok(result.milestones.every(m => !m.earned));
  assert.equal(result.steps[0].status, 'unknown');
});

test('duplicate lessons and missions do not inflate totals, conflicts stay unconfirmed', () => {
  const l = lesson('l1', 1, [mission('a', 'approved')], true);
  const result = learnerMetrics(snapshot([l, structuredClone(l)]));
  assert.equal(result.totalLessons, 1); assert.equal(result.totalRequired, 1); assert.equal(result.completedLessons, 1);
  const changed = structuredClone(l); changed.missions[0].status = 'rejected';
  const conflict = learnerMetrics(snapshot([l, changed]));
  assert.equal(conflict.unknownCount, 1); assert.equal(conflict.approvedRequired, 0);
  assert.ok(conflict.milestones.every(m => !m.earned));
});

test('report names the as-of date in KST, scope and denominators, not an earned revenue claim', () => {
  const result = learnerMetrics(snapshot([lesson('l1', 1, [mission('a', 'approved')], true), lesson('l2', 2)]));
  assert.match(result.reportText, /2026\. 11\. 3\./);
  assert.match(result.reportText, /KST/);
  assert.match(result.reportText, /문샷 \/ 3기/);
  assert.match(result.reportText, /수업 완료: 1 \/ 2개/);
  assert.match(result.reportText, /필수 미션 승인: 1 \/ 1개 \(100%\)/);
  assert.match(result.reportText, /실제 사업 매출을 뜻하지 않습니다/);
  assert.ok(!result.reportText.includes('XP'));
});

test('invalid as-of date is explicit and calculations do not mutate the original snapshot', () => {
  const input = snapshot([lesson('l2', 2, [mission('m2', 'rejected')]), lesson('l1', 1)]);
  input.fetchedAt = 'bad-date';
  const before = structuredClone(input);
  const result = learnerMetrics(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.steps.map(s => s.day), [1, 2]);
  assert.match(result.reportText, /조회 시각 확인 필요/);
});

test('completed lesson without required missions is a completed lesson, not curriculum graduation', () => {
  const result = learnerMetrics(snapshot([lesson('l1', 1, [], true)]));
  assert.equal(result.completedLessons, 1);
  assert.equal(result.steps[0].status, 'complete');
  assert.equal(result.approvalPercent, null);
  assert.ok(result.milestones.every(m => !m.earned));
});

test('approved work without a lesson completion marker is in progress, not never started', () => {
  const result = learnerMetrics(snapshot([lesson('l1', 1, [mission('m1', 'approved')]) ]));
  assert.equal(result.steps[0].status, 'in_progress');
  assert.equal(result.completedLessons, 0);
  assert.equal(result.nextActions[0].kind, 'continue_lesson');
});
