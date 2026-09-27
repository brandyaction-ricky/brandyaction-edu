import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const ruleExports = {};
const compiledRules = ts.transpileModule(fs.readFileSync(new URL('../lib/platform-rules.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', compiledRules)(ruleExports);

function harness(fixtures = {}) {
  const calls = [];
  const db = {
    from(table) {
      const call = { table, filters: [], columns: '' };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return this; },
        eq(key, value) { call.filters.push([key, value]); return this; },
        in(key, value) { call.filters.push([key, value]); return this; },
        order() { return this; },
        limit() { return this; },
        then(resolve) {
          const data = (fixtures[table] || []).filter(row => call.filters.every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const source = fs.readFileSync(new URL('../lib/member-platform-data.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => {
    if (name === '@/lib/supabase/server') return { createClient: async () => db };
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => db };
    if (name === '@/lib/platform-rules') return ruleExports;
    throw Error(name);
  });
  return { read: exports.readMemberPlatformData, calls };
}

test('profile has no data prefetch and dashboard omits orders and review bodies', async () => {
  const profile = harness();
  assert.deepEqual(await profile.read('owner', 'profile'), {});
  assert.deepEqual(profile.calls, []);
  const dashboard = harness();
  await dashboard.read('owner', 'dashboard');
  assert.deepEqual(dashboard.calls.map(call => call.table), ['enrollments', 'edu_questions', 'customer_coupons']);
  assert.ok(dashboard.calls.every(call => call.filters.some(([key, value]) => key === 'user_id' && value === 'owner')));
});

test('learning requires a current owner enrollment before requesting content', async () => {
  const denied = harness({ enrollments: [{ id: 'other', user_id: 'other', course_id: 'private', status: 'active' }] });
  assert.deepEqual(await denied.read('owner', 'learn', 'other'), { enrollments: [] });
  assert.deepEqual(denied.calls.map(call => call.table), ['enrollments']);
  const expired = harness({ enrollments: [{ id: 'old', user_id: 'owner', course_id: 'private', status: 'revoked' }] });
  assert.deepEqual(await expired.read('owner', 'learn', 'old'), { enrollments: [] });
  assert.deepEqual(expired.calls.map(call => call.table), ['enrollments']);
});

test('revoked enrollment never causes resource metadata to be read', async () => {
  const member = harness({ enrollments: [{ id: 'old', user_id: 'owner', course_id: 'private', status: 'revoked' }] });
  const result = await member.read('owner', 'resources');
  assert.equal(result.enrollments.length, 1);
  assert.deepEqual(member.calls.map(call => call.table), ['enrollments']);
});


test('real access dates use the current clock rather than an array callback index', async () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  const future = new Date(Date.now() + 86400000).toISOString();
  const enrollment = { id: 'owned', user_id: 'owner', course_id: 'course', cohort_id: 'cohort', status: 'active', access_starts_at: past };
  const fixtures = {
    enrollments: [enrollment],
    courses: [{ id: 'course' }], cohorts: [{ id: 'cohort' }],
    curriculum_weeks: [{ id: 'week', course_id: 'course', is_published: true }],
    curriculum_lessons: [{ id: 'lesson', week_id: 'week', is_published: true }],
    lesson_contents: [{ lesson_id: 'lesson', body_text: 'owned learning content' }],
  };
  for (const view of ['learn', 'resources']) {
    const member = harness(fixtures);
    const result = await member.read('owner', view, 'owned', 'lesson');
    assert.equal(result.lesson_contents[0].body_text, 'owned learning content');
  }
  for (const overrides of [{ access_starts_at: future }, { access_ends_at: past }, { revoked_at: past }, { status: 'revoked' }]) {
    const member = harness({ ...fixtures, enrollments: [{ ...enrollment, ...overrides }] });
    assert.deepEqual(await member.read('owner', 'learn', 'owned', 'lesson'), { enrollments: [] });
    assert.deepEqual(member.calls.map(call => call.table), ['enrollments']);
  }
});
