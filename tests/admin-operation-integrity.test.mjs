import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { submissionReview } from './helpers/submission-review.mjs';
import { productVisibility } from './helpers/product-visibility.mjs';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, name => {
    if (name === '@/lib/submission-review') return submissionReview;
    if (name === '@/lib/product-visibility') return productVisibility;
    if (name === '@/lib/public-platform-data') return { getPublicPlatformData: async () => ({ data: {}, pagination: null }), getPublicSupport: async () => ({}) };
    if (name === '@/lib/public-platform-plan') return { PUBLIC_CACHE_TAG: 'test' };
    if (name === '@/lib/member-platform-data') return { readMemberPlatformData: async () => ({}) };
    if (name === 'next/cache') return { revalidateTag: () => {} };
    if (!(name in dependencies)) throw Error(name);
    return dependencies[name];
  });
  return exports;
}
const platform = load('lib/platform.ts'), rules = load('lib/qa-rules.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const admin = { id: id(1), role: 'admin', status: 'active', permissions: { members: true, products: true } };
function harness({ missions = [], user = admin } = {}) {
  const tables = {
    profiles: [admin, { id: id(2), role: 'student', status: 'active', marketing_consent: true }, { id: id(3), role: 'student', status: 'withdrawn', marketing_consent: true }],
    curriculum_weeks: [{ id: id(11), course_id: id(101) }, { id: id(12), course_id: id(102) }],
    curriculum_lessons: [{ id: id(21), week_id: id(11) }, { id: id(22), week_id: id(12) }],
    curriculum_missions: missions,
  };
  const writes = [], calls = [];
  const db = {
    from(table) {
      const filters = []; let start = 0, end = Infinity, head = false, single = false, values;
      function field(row, key) {
        if (key === 'enrollments.user_id') return row.enrollments?.user_id;
        if (!key.startsWith('curriculum_lessons.')) return row[key];
        const lesson = tables.curriculum_lessons.find(item => item.id === row.lesson_id);
        return key.endsWith('.course_id') ? tables.curriculum_weeks.find(item => item.id === lesson?.week_id)?.course_id : lesson?.week_id;
      }
      const query = {
        select(columns, options) { head = Boolean(options?.head); calls.push({ table, columns }); return this; },
        eq(key, value) { filters.push(row => field(row, key) === value); return this; },
        neq(key, value) { filters.push(row => field(row, key) !== value); return this; },
        is(key) { filters.push(row => field(row, key) == null); return this; },
        not(key) { filters.push(row => field(row, key) != null); return this; },
        order() { return this; }, limit(n) { end = n - 1; return this; }, range(a, b) { start = a; end = b; return this; },
        single() { single = true; return this; }, maybeSingle() { single = true; return this; },
        update(input) { values = input; return this; },
        then(resolve) {
          const rows = (tables[table] || []).filter(row => filters.every(filter => filter(row)));
          if (values) { writes.push({ table, values }); rows.forEach(row => Object.assign(row, values)); }
          return Promise.resolve({ data: head ? null : single ? rows[0] || null : rows.slice(start, end + 1), count: rows.length, error: null }).then(resolve);
        },
      };
      return query;
    },
    async rpc(name, args) {
      if (name === 'edu_admin_summary') return { data: { id: 'summary', members: 3 }, error: null };
      if (name === 'edu_create_record') { writes.push({ table: args.p_table, values: args.p_values }); return { data: { id: id(99), ...args.p_values }, error: null }; }
      throw Error(name);
    },
  };
  const route = load('app/api/platform/route.ts', {
    '@/lib/server-auth': { getAuthenticatedUser: async () => user },
    '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/platform': platform, '@/lib/platform-rules': load('lib/platform-rules.ts'), '@/lib/qa-rules': rules,
    '@/lib/product-metadata': {}, '@/lib/edu-settings': { getEduSettings: async () => ({ operations: {} }) },
    '@/lib/mission-quiz': {}, '@/lib/legal-policies': {}, '@/lib/crm-delivery': { crmDeliveryState: () => ({}) },
    '@/lib/operator-permissions': { getOperatorUser: async () => user?.role === 'admin' ? user : null, permissionsFor: async () => user?.permissions || {}, sectionScopes: { home: 'members', customers: 'members', missions: 'products' } },
  });
  return {
    tables, writes, calls,
    read: query => route.GET(new Request('https://example.test/api/platform?admin=1&' + query)),
    save: (values, missionId) => route.POST(new Request('https://example.test/api/platform', { method: 'POST', body: JSON.stringify({ action: 'save', section: 'missions', id: missionId, requestId: id(99), values }) })),
  };
}
const mission = (n, extras = {}) => ({ id: id(30 + n), lesson_id: id(21), title: '합성 미션', is_published: true, archived_at: null, ...extras });

test('home, list, exact status totals and export population exclude withdrawal but include admin', async () => {
  const api = harness();
  const home = await (await api.read('section=home')).json();
  const members = await (await api.read('section=customers')).json();
  assert.equal(home.data.admin_summary[0].members, 2);
  assert.equal(members.pagination.total, 2);
  assert.deepEqual(members.data.profiles.map(row => row.id), [id(1), id(2)]);
  assert.deepEqual(members.data.member_summary[0], { id: 'member-summary', active: 2, suspended: 0, marketing: 1 });
});
test('mission counts separate publication from archive, scoped before server pagination', async () => {
  const api = harness({ missions: [...Array.from({ length: 101 }, (_, n) => mission(n)), mission(201, { is_published: false }), mission(202, { is_published: false, archived_at: '2026-09-25' }), mission(203, { lesson_id: id(22) })] });
  const active = await (await api.read(`section=missions&course=${id(101)}&page=2`)).json();
  assert.equal(active.pagination.total, 102);
  assert.equal(active.data.curriculum_missions.length, 2);
  assert.deepEqual(active.data.mission_summary[0], { id: 'mission-summary', active: 102, published: 101, hidden: 1, archived: 1 });
  const archived = await (await api.read(`section=missions&course=${id(101)}&missionState=archived`)).json();
  assert.equal(archived.pagination.total, 1);
  assert.ok(archived.data.curriculum_missions[0].archived_at);
  assert.ok(api.calls.some(call => call.columns?.includes('curriculum_lessons!inner')));
  const hidden = await (await api.read(`section=missions&week=${id(11)}&missionState=hidden`)).json();
  assert.equal(hidden.pagination.total, 1);
  const wrongWeek = await (await api.read(`section=missions&course=${id(101)}&week=${id(12)}`)).json();
  assert.equal(wrongWeek.pagination.total, 0);
});
test('invalid mission scope and unauthorized operator fail without writes', async () => {
  const api = harness();
  for (const query of ['course=bad', 'week=bad', 'missionState=all']) assert.equal((await api.read('section=missions&' + query)).status, 400);
  assert.equal((await harness({ user: null }).read('section=missions')).status, 401);
  assert.equal((await harness({ user: { ...admin, role: 'student', permissions: {} } }).save({})).status, 403);
  assert.equal(api.writes.length, 0);
});
test('new mission rejects foreign product/week and missing lesson; only validated fields persist', async () => {
  const api = harness();
  const values = { title: '신규 미션', lesson_id: id(21), course_id: id(101), week_id: id(11), submission_type: 'text', is_published: false };
  for (const overrides of [{ course_id: id(102) }, { week_id: id(12) }, { lesson_id: id(123) }]) assert.equal((await api.save({ ...values, ...overrides })).status, 400);
  assert.equal(api.writes.length, 0);
  assert.equal((await api.save(values)).status, 200);
  assert.equal(api.writes[0].values.course_id, undefined);
  assert.equal(api.writes[0].values.week_id, undefined);
  assert.equal(api.writes[0].values.lesson_id, id(21));
});
test('existing mission cannot move across products; archived restore keeps lesson and remains unpublished', async () => {
  const api = harness({ missions: [mission(1, { is_published: false, archived_at: '2026-09-25' })] });
  assert.equal((await api.save({ lesson_id: id(22), course_id: id(102) }, id(31))).status, 400);
  assert.equal(api.writes.length, 0);
  assert.equal((await api.save({ is_published: false }, id(31))).status, 200);
  assert.deepEqual(api.writes[0].values, { archived_at: null, is_published: false });
  const restored = await (await api.read('section=missions&missionState=hidden')).json();
  assert.equal(restored.pagination.total, 1);
  assert.equal(restored.data.curriculum_missions[0].lesson_id, id(21));
});

test('member and question context scopes apply before pagination, archived questions remain reachable', async () => {
  const api = harness();
  api.tables.edu_questions = [
    ...Array.from({ length: 101 }, (_, n) => ({ id: id(n + 200), user_id: id(2), status: 'open', is_archived: false })),
    { id: id(401), user_id: id(2), status: 'answered', is_archived: true },
    { id: id(402), user_id: id(1), status: 'answered', is_archived: false },
  ];
  const scoped = await (await api.read(`section=questions&member=${id(2)}&questionState=open&page=2`)).json();
  assert.equal(scoped.pagination.total, 101); assert.equal(scoped.data.edu_questions.length, 1);
  const archived = await (await api.read(`section=questions&member=${id(2)}&questionState=archived`)).json();
  assert.deepEqual(archived.data.edu_questions.map(row => row.id), [id(401)]);
  const direct = await (await api.read(`section=questions&question=${id(401)}`)).json();
  assert.equal(direct.data.edu_questions[0].is_archived, true);
  const member = await (await api.read(`section=customers&member=${id(2)}`)).json();
  assert.deepEqual(member.data.profiles.map(row => row.id), [id(2)]);
  for (const query of ['section=questions&member=bad', 'section=questions&question=bad', 'section=questions&questionState=unknown', 'section=reviews&submission=bad']) assert.equal((await api.read(query)).status, 400);
});
test('submission deep links and member scope use inner joins with unambiguous profile FK', async () => {
  const api = harness();
  api.tables.mission_submissions = [{ id: id(501), enrollments: { user_id: id(2) } }, { id: id(502), enrollments: { user_id: id(1) } }];
  for (const query of [`member=${id(2)}`, `submission=${id(501)}`]) {
    const data = await (await api.read('section=reviews&' + query)).json();
    assert.deepEqual(data.data.mission_submissions.map(row => row.id), [id(501)]);
  }
  assert.match(rules.adminSelectColumns('reviews', 'mission_submissions'), /enrollments!inner.*profiles!enrollments_user_id_fkey/);
  assert.equal(api.writes.length, 0);
});
