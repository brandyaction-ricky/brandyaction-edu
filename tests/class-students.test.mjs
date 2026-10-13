import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import Ajv from 'ajv';
function load(path, mocks = {}) {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, name => mocks[name]);
  return exports;
}
const care = load('lib/learning-care.ts');
const logic = load('lib/class-students.ts', { './learning-care': care });
const tools = load('lib/class-students-tool.ts', { './class-students': logic });
const cohortId = 'aaaaaaaa-1111-4111-8111-111111111111', otherId = 'bbbbbbbb-1111-4111-8111-111111111111';
const actorId = 'cccccccc-1111-4111-8111-111111111111';
const asOf = '2026-10-13T01:00:00.000Z';
const cell = (state, i, options = {}) => ({ lessonId: 'private-lesson-' + i, title: '학습 ' + i, week: 1, day: i, track: 'learning', state, published: true, ...options });
const row = (name, done = 0, total = 10, options = {}) => ({ memberId: 'private-member-' + name, enrollmentId: 'private-enrollment-' + name, name, email: 'private-mail@invalid.test', phone: 'private-phone', lastVisitAt: asOf, lastContactAt: 'private-contact', openQuestions: 2, cells: Array.from({ length: total }, (_, i) => cell(i < done ? 'completed' : 'not_submitted', i + 1)), ...options });
const snapshot = (rows = [row('가상 수강생', 2)]) => ({ cohorts: [{ id: cohortId, name: '4기', courseTitle: 'AI 문샷 챌린지', memberCount: rows.length }], cohortId, asOf, rows });
const input = extra => logic.parseClassStudentsInput({ cohort: 'AI 문샷 챌린지 4기', ...extra });
const project = (rows, extra) => logic.classStudentsProjection(snapshot(rows), input(extra));

test('projection matches published learning counts, dashboard next item and null progress', () => {
  const rows = [row('가상 수강생', 2, 10), row('공개 전', 0, 0), row('설정 확인', 0, 1, { cells: [cell('error', 1)] })];
  rows[0].cells.push(cell('completed', 11, { track: 'daily' }), cell('error', 12, { published: false }), cell('changes_requested', 13));
  const result = project(rows);
  assert.equal(result.total_students, 3);
  assert.deepEqual([result.students[0].progress_percent, result.students[0].completed_learning, result.students[0].total_published_learning], [18, 2, 11]);
  assert.deepEqual(result.students[0].next_learning, { title: '학습 3', week: 1, day: 3 });
  assert.equal(result.students[1].progress_percent, null);
  assert.equal(result.students[2].next_learning, null);
  assert.equal(result.students[2].progress_percent, null);
});
test('schema and runtime reject forged actors, actions, malformed and unbounded filters', () => {
  const validate = new Ajv().compile(tools.classStudentsToolDefinition.inputSchema);
  for (const payload of [null, [], {}, { cohort: '' }, { cohort: '4기', actor: actorId }, { cohort: '4기', action: 'send' }, { cohort: '4기', limit: 101 }, { cohort: '4기', offset: -1 }, { cohort: '4기', inactive_only: 'true' }, { cohort: '4기', progress_range: ['all'] }]) {
    assert.throws(() => logic.parseClassStudentsInput(payload));
    assert.equal(validate(payload), false);
  }
  assert.throws(() => logic.parseClassStudentsInput({ cohort: '4기\n' }));
  assert.throws(() => logic.parseClassStudentsInput({ cohort: '4기', limit: NaN }));
  assert.equal(validate({ cohort: '4기', student_name: '가상', progress_range: 'progressing', offset: 0, limit: 100 }), true);
  assert.equal(logic.parseClassStudentsInput({ cohort: cohortId.toUpperCase() }).cohort, cohortId);
});
test('name search never searches private email and output whitelists every nested field', () => {
  const rows = [row('가상'), row('이름 미등록', 0, 0, { name: null })];
  const before = JSON.stringify(rows), result = project(rows);
  assert.equal(project(rows, { student_name: 'private-mail' }).matching_enrollments, 0);
  assert.equal(project(rows, { student_name: ' 가상 ' }).matching_enrollments, 1);
  assert.doesNotMatch(JSON.stringify(result), /private-|@invalid|memberId|enrollmentId|lessonId|lastContactAt|openQuestions|phone|email/);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(result.students[1].name, '이름 미등록');
});
test('bands use the dashboard unrounded ratio, including rounded 10 and 80 boundary cases', () => {
  for (const [done, total, percent, band] of [[0, 10, 0, 'starting'], [1, 11, 9, 'starting'], [10, 101, 10, 'starting'], [1, 10, 10, 'progressing'], [79, 99, 80, 'progressing'], [8, 10, 80, 'finishing'], [10, 10, 100, 'finishing'], [0, 0, null, 'unknown']]) {
    const result = project([row('가상', done, total)], { progress_range: band });
    assert.equal(result.matching_enrollments, 1);
    assert.equal(result.students[0].progress_percent, percent);
  }
});
test('inactive and attention retain their separate exact dashboard thresholds and unknown visits', () => {
  const threshold = '2026-10-10T01:00:00.000Z';
  const rows = [row('경계', 0, 10, { lastVisitAt: threshold }), row('오래됨', 0, 10, { lastVisitAt: '2026-10-10T00:59:59Z' }), row('기록 없음', 0, 10, { lastVisitAt: null }), row('검토 대기', 0, 1, { lastVisitAt: '2026-10-01T00:00:00Z', cells: [cell('submitted', 1)] }), row('보완', 0, 1, { cells: [cell('changes_requested', 1)] })];
  assert.deepEqual(project(rows, { inactive_only: true }).students.map(s => s.name), ['오래됨', '검토 대기']);
  assert.deepEqual(project(rows, { attention_only: true }).students.map(s => s.name), ['경계', '오래됨', '보완']);
  assert.deepEqual(project(rows, { inactive_only: true, attention_only: true }).students.map(s => s.name), ['오래됨']);
});
test('pagination keeps full cohort and filtered counts separate without changing database order', () => {
  const rows = Array.from({ length: 125 }, (_, i) => row('가상 ' + i, i % 2 ? 8 : 0));
  const first = project(rows, { progress_range: 'finishing', limit: 50 });
  const last = project(rows, { progress_range: 'finishing', offset: first.next_offset, limit: 50 });
  assert.deepEqual([first.total_students, first.total_enrollments, first.matching_enrollments, first.students.length, last.students.length, last.next_offset], [125, 125, 62, 50, 12, null]);
  assert.equal(new Set([...first.students, ...last.students].map(s => s.name)).size, 62);
  assert.equal(project(rows, { offset: 1000 }).next_offset, null);
  rows[1].memberId = rows[0].memberId;
  assert.deepEqual([project(rows).total_students, project(rows).total_enrollments], [124, 125]);
});
function harness({ authorized = true, snapshots = [snapshot()], error = null, authError = false } = {}) {
  const calls = []; let factories = 0, authorizations = 0;
  const tool = tools.createClassStudentsTool({ authorizeMembers: async () => { authorizations++; if (authError) throw new Error('private credential'); return authorized ? { id: actorId } : null; }, database: () => { factories++; return { rpc: (name, args, options) => ({ abortSignal: async signal => { assert.equal(signal.aborted, false); calls.push({ name, args, options }); return { data: snapshots[Math.min(calls.length - 1, snapshots.length - 1)], error }; } }) }; } });
  return { tool, calls, get factories() { return factories; }, get authorizations() { return authorizations; } };
}
test('authenticated tool uses only the existing read RPC with trusted actor and GET read-only option', async () => {
  const h = harness();
  const result = await h.tool.execute({ cohort: 'AI 문샷 챌린지 4기' });
  assert.equal(h.tool.name, 'get_class_students');
  assert.deepEqual(h.tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  assert.deepEqual(h.calls, [{ name: 'edu_admin_learning_care', args: { p_actor: actorId, p_cohort: null }, options: { get: true } }]);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.doesNotMatch(JSON.stringify(result), /private-/);
  await h.tool.execute({ cohort: cohortId });
  assert.equal(h.authorizations, 2);
  assert.equal(h.calls[1].args.p_cohort, cohortId);
});
test('authorization failure and invalid input never create a privileged database client', async () => {
  for (const options of [{ authorized: false }, { authError: true }]) {
    const h = harness(options), result = await h.tool.execute({ cohort: '4기' });
    assert.equal(result.isError, true); assert.equal(h.factories, 0); assert.doesNotMatch(JSON.stringify(result), /private/);
  }
  const h = harness(); assert.equal((await h.tool.execute({ cohort: '4기', actor: actorId })).isError, true); assert.equal(h.factories, 0);
});
test('name resolution switches to exact requested cohort, never guesses across ambiguous names', async () => {
  const target = snapshot([row('가상 4기')]);
  const options = [...target.cohorts, { id: otherId, name: '4기', courseTitle: '다른 과정' }];
  const initial = { ...snapshot([row('다른 과정')]), cohorts: options, cohortId: otherId };
  const h = harness({ snapshots: [initial, { ...target, cohorts: options }] });
  const result = await h.tool.execute({ cohort: 'AI 문샷 챌린지 · 4기' });
  assert.equal(result.structuredContent.students[0].name, '가상 4기'); assert.equal(h.calls[1].args.p_cohort, cohortId);
  const ambiguous = harness({ snapshots: [initial] });
  assert.equal((await ambiguous.tool.execute({ cohort: '4기' })).isError, true); assert.equal(ambiguous.calls.length, 1);
  const wrong = harness({ snapshots: [initial] }); assert.equal((await wrong.tool.execute({ cohort: '없는 과정 4기' })).isError, true);
});
test('database errors, revoked scope and concurrent cohort changes disclose no private records', async () => {
  for (const error of [{ message: 'private SQL credential' }, { message: 'FORBIDDEN' }]) {
    const h = harness({ error }); const result = await h.tool.execute({ cohort: cohortId });
    assert.equal(result.isError, true); assert.doesNotMatch(JSON.stringify(result), /private|FORBIDDEN/);
  }
  const initial = { ...snapshot(), cohortId: otherId };
  const h = harness({ snapshots: [initial, initial] });
  const result = await h.tool.execute({ cohort: cohortId });
  assert.equal(result.isError, true); assert.doesNotMatch(JSON.stringify(result), /private-/);
  const removed = harness({ snapshots: [{ ...snapshot(), cohorts: [] }] });
  assert.equal((await removed.tool.execute({ cohort: cohortId })).isError, true);
});
