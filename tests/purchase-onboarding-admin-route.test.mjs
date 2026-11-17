import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function compile(path, dependencies = {}) {
  const compiledExports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  new Function('exports', 'require', outputText)(compiledExports, name => dependencies[name]);
  return compiledExports;
}

const config = compile('../lib/purchase-onboarding.ts');
const cohort = '11111111-1111-4111-8111-111111111111';
const product = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const settings = { label: '문샷 공부방 입장하기', url: 'https://campus.example.test/welcome?cohort=5#start' };
const endpoint = 'https://edu.test/api/admin/purchase-onboarding';

function handler({ authorized = true } = {}) {
  const writes = [];
  const audits = [];
  const rows = {
    cohorts: [
      { id: cohort, course_id: product, courses: { title: '문샷', category: 'paid_class', list_price: 100 } },
      { id: other, course_id: other, courses: { title: '다른 상품', category: 'paid_class', list_price: 100 } },
      { id: product, course_id: product, courses: { title: '무료 기수', category: 'free', list_price: 0 } },
    ],
    site_settings: writes,
  };
  const db = { from(table) {
    let result = rows[table] || [];
    const value = (row, key) => key.split('.').reduce((current, part) => current?.[part], row);
    const query = {
      select: () => query, order: () => query,
      eq(key, expected) { result = result.filter(row => value(row, key) === expected); return query; },
      neq(key, expected) { result = result.filter(row => value(row, key) !== expected); return query; },
      gt(key, expected) { result = result.filter(row => value(row, key) > expected); return query; },
      limit: async count => ({ data: result.slice(0, count) }),
      maybeSingle: async () => ({ data: result[0] }),
      upsert: async row => {
        const previous = writes.findIndex(entry => entry.key === row.key);
        if (previous < 0) writes.push(row);
        else writes[previous] = row;
        return {};
      },
      insert: async row => { audits.push(row); return {}; },
    };
    return query;
  } };
  const route = compile('../app/api/admin/purchase-onboarding/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/operator-permissions': { getOperatorUser: async () => authorized ? { id: 'operator', permissions: { orders: true } } : null },
    '@/lib/purchase-onboarding': config,
  });
  return { writes, audits, get: query => route.GET(new Request(endpoint + '?' + new URLSearchParams(query))),
    post: (body = {}, origin = 'https://edu.test') => route.POST(new Request(endpoint, {
      method: 'POST', headers: { origin }, body: JSON.stringify({ product, cohort, settings, ...body }),
    })) };
}

test('product list and selected settings enforce the same cohort scope on reads and writes', async () => {
  const h = handler();
  assert.deepEqual((await (await h.get({ product })).json()).cohorts.map(row => row.id), [cohort]);
  assert.equal((await h.get({ product, cohort: other })).status, 400);
  assert.equal((await h.post({ cohort: other })).status, 400);
  assert.equal(h.writes.length, 0);
  assert.equal((await h.post()).status, 200);
  assert.deepEqual((await (await h.get({ product, cohort })).json()).settings, settings);
  assert.equal(h.writes[0].key, config.completionGuideSettingsKey(cohort));
  assert.equal(h.writes[0].is_public, false);
  assert.equal(JSON.stringify(h.audits).includes(settings.url), false);
  const messageOnly = { label: '', url: '', message: 'OT는 월요일에 진행합니다.\n준비물을 확인해 주세요.' };
  assert.equal((await h.post({ settings: { ...messageOnly, message: ' ' + messageOnly.message.replace('\n', '\r\n') + ' ' } })).status, 200);
  assert.deepEqual((await (await h.get({ product, cohort })).json()).settings, messageOnly);
  assert.deepEqual(h.audits.at(-1).after_data, { enabled: true, guideConfigured: false, messageConfigured: true });
  assert.equal(JSON.stringify(h.audits).includes('OT는 월요일'), false);
  assert.equal((await h.post({ settings: { label: '', url: '' } })).status, 200);
  assert.deepEqual((await (await h.get({ product, cohort })).json()).settings, { label: '', url: '' });
});

test('unprivileged, cross-origin and incomplete or unsafe link writes are rejected', async () => {
  assert.equal((await handler({ authorized: false }).post()).status, 403);
  assert.equal((await handler().post({}, 'https://other.test')).status, 403);
  const h = handler();
  for (const invalid of [
    { label: '', url: '', message: 5 },
    { label: '', url: '', message: '가'.repeat(501) },
    { label: '', url: settings.url },
    { label: settings.label, url: '' },
    { label: settings.label, url: 'javascript:alert(1)' },
    { label: settings.label, url: 'https://user:pass@campus.example.test' },
    { label: settings.label, url: 'https://campus.example.test/\nunsafe' },
  ]) assert.equal((await h.post({ settings: invalid })).status, 400);
  assert.equal(h.writes.length, 0);
});
