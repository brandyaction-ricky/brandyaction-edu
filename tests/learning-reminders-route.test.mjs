import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const learner = '10000000-0000-4000-8000-000000000001';
const enrollmentId = '20000000-0000-4000-8000-000000000002';
const requestId = '30000000-0000-4000-8000-000000000003';
const origin = 'https://edu.example.test';
const requestPayload = { action:'request', enrollmentId, requestId, kind:'member_inactive', days:3 };

function load(path, modules) {
  const exports = {};
  const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } });
  new Function('exports', 'require', compiled.outputText)(exports, name => {
    assert.ok(modules[name], `Unexpected dependency: ${name}`);
    return modules[name];
  });
  return exports;
}

function route({ user = { id:learner, role:'student' }, error = null } = {}) {
  const crm = load('lib/crm-retention.ts', {});
  const logic = load('lib/learning-reminders.ts', {
    './crm-retention': crm,
    './edu-workflows': { uuid: value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) },
  });
  const calls = [];
  const operations = load('app/api/platform/learning-reminders/route.ts', {
    '@/lib/learning-reminders':logic,
    '@/lib/server-auth':{ getAuthenticatedUser:async () => user },
    '@/lib/supabase/admin':{ createAdminClient:() => ({ rpc:(name, args) => {
      calls.push({ name, args });
      return { abortSignal:async () => ({ data:{ courses:[], maskedPhone:null }, error }) };
    } }) },
  });
  return { calls, ...operations };
}

const read = () => new Request(`${origin}/api/platform/learning-reminders?p_user=another`);
const write = (body, header = origin) => new Request(`${origin}/api/platform/learning-reminders`, {
  method:'POST', headers:{ origin:header }, body:JSON.stringify(body),
});

test('authenticated student reads and writes use the server identity and only the request RPC', async () => {
  const api = route();
  const info = await api.GET(read());
  assert.equal(info.status, 200);
  assert.equal(info.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await info.json(), { courses:[], maskedPhone:null });
  assert.equal((await api.POST(write(requestPayload))).status, 200);
  assert.equal((await api.POST(write({ action:'cancel', requestId }))).status, 200);
  assert.deepEqual(api.calls, [
    { name:'edu_learning_reminders', args:{ p_user:learner, p_action:'list' } },
    { name:'edu_learning_reminders', args:{ p_user:learner, p_action:'request', p_request:requestId, p_enrollment:enrollmentId, p_kind:'member_inactive', p_days:3 } },
    { name:'edu_learning_reminders', args:{ p_user:learner, p_action:'cancel', p_request:requestId } },
  ]);
});

test('guest, operator, foreign origin, forged member and invalid request fields do not reach the database', async () => {
  for (const [user,status] of [[null,401],[{ id:learner, role:'admin' },403]]) {
    const api = route({ user });
    assert.equal((await api.GET(read())).status, status);
    assert.equal((await api.POST(write(requestPayload))).status, status);
    assert.equal(api.calls.length, 0);
  }
  const api = route();
  assert.equal((await api.POST(write(requestPayload, 'https://elsewhere.test'))).status, 403);
  for (const body of [
    { ...requestPayload, userId:learner }, { ...requestPayload, days:'3' }, { ...requestPayload, days:366 },
    { ...requestPayload, kind:'purchase_completed' }, { ...requestPayload, requestId:null },
    { action:'cancel', requestId, phone:'01012341234' },
  ]) assert.equal((await api.POST(write(body))).status, 400);
  assert.equal((await api.POST(write({ ...requestPayload, ignored:'x'.repeat(1024) }))).status, 413);
  assert.equal(api.calls.length, 0);
});

test('ineligible or unavailable database results remain safe without exposing private details', async () => {
  for (const [code,status] of [['42501',403],['22023',400],['PGRST202',503]]) {
    const result = await route({ error:{ code, details:'private detail' } }).POST(write(requestPayload));
    assert.equal(result.status, status);
    assert.doesNotMatch(await result.text(), /private detail/);
  }
});
