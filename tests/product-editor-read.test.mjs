import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const courseId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

function platformRead() {
  const source = fs.readFileSync(new URL('../app/api/platform/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [];
  const db = {
    from(table) {
      const call = { table, filters: [], columns: '', options: undefined, limit: null, range: null };
      calls.push(call);
      const query = {
        select(columns, options) { call.columns = columns; call.options = options; return this; },
        eq(column, value) { call.filters.push([column, value]); return this; },
        is() { return this; },
        not() { return this; },
        in() { return this; },
        order() { return this; },
        limit(value) { call.limit = value; return this; },
        range(start, end) { call.range = [start, end]; return this; },
        then(resolve, reject) {
          const selected = call.filters.some(([column, value]) => (column === 'id' || column === 'course_id') && value === courseId);
          const data = table === 'courses' ? [{ id: courseId, title: '상품' }]
            : table === 'cohorts' ? selected ? [{ id: 'cohort', course_id: courseId }] : [{ id: 'cohort', course_id: courseId }, { id: 'other', course_id: otherId }]
              : table === 'landing_configs' ? [{ id: courseId, kakao_url: '' }]
                : table === 'curriculum_weeks' && selected ? [{ id: 'week', course_id: courseId, is_published: true, curriculum_lessons: [{ id: 'lesson', week_id: 'week', is_published: true }] }] : [];
          return Promise.resolve({ data, count: data.length, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const user = { id: 'operator', role: 'admin', permissions: { products: true, members: true } };
  const mocks = {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': {},
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/platform': { sections: [{ key: 'products', table: 'courses' }] },
    '@/lib/platform-rules': {},
    '@/lib/edu-settings': { getEduSettings: async () => ({ operations: {} }) },
    '@/lib/qa-rules': {
      adminTables: { products: ['courses', 'cohorts', 'curriculum_weeks', 'curriculum_lessons', 'lesson_contents'] },
      adminSelectColumns: () => '*',
      cohortStatus: () => 'upcoming',
      imagePreviewUrl: value => value,
    },
    '@/lib/operator-permissions': { getOperatorUser: async () => user, sectionScopes: { products: 'products' } },
  };
  const exports = {};
  new Function('exports', 'require', 'process', compiled)(exports, name => mocks[name] || {}, { env: {} });
  return { get: exports.GET, calls };
}

test('product editor reads its course, cohorts, conversion and minimal readiness pair', async () => {
  const { get, calls } = platformRead();
  const response = await get(new Request(`https://edu.example/api/platform?admin=1&section=products&record=${courseId}`));
  assert.equal(response.status, 200);
  const { data, pagination } = await response.json();
  assert.equal(pagination, null);
  assert.deepEqual(data.courses.map(row => row.id), [courseId]);
  assert.deepEqual(data.cohorts.map(row => row.course_id), [courseId]);
  assert.deepEqual(data.landing_configs.map(row => row.id), [courseId]);
  assert.equal(data.product_summary, undefined);
  assert.deepEqual(new Set(calls.map(call => call.table)), new Set(['mission_submissions', 'courses', 'cohorts', 'landing_configs', 'curriculum_weeks']));
  assert.deepEqual(calls.find(call => call.table === 'courses').filters, [['id', courseId]]);
  assert.equal(calls.find(call => call.table === 'courses').limit, 1);
  assert.deepEqual(calls.find(call => call.table === 'cohorts').filters, [['course_id', courseId]]);
  const curriculum = calls.find(call => call.table === 'curriculum_weeks');
  assert.equal(curriculum.limit, 1);
  assert.deepEqual(curriculum.filters, [['course_id', courseId], ['is_published', true], ['curriculum_lessons.is_published', true]]);
  assert.doesNotMatch(curriculum.columns, /\*|body|content/);
  assert.deepEqual(data.curriculum_weeks, [{ id: 'week', course_id: courseId, is_published: true }]);
  assert.deepEqual(data.curriculum_lessons, [{ id: 'lesson', week_id: 'week', is_published: true }]);
});

test('product catalog still reads publication checks and summary counts', async () => {
  const { get, calls } = platformRead();
  const response = await get(new Request('https://edu.example/api/platform?admin=1&section=products'));
  assert.equal(response.status, 200);
  const { data, pagination } = await response.json();
  assert.equal(pagination.total, 1);
  assert.equal(data.product_summary[0].total, 1);
  assert.ok(Array.isArray(data.curriculum_weeks));
  assert.ok(Array.isArray(data.curriculum_lessons));
  assert.ok(Array.isArray(data.lesson_contents));
  assert.equal(calls.filter(call => call.table === 'courses').length, 5);
});
