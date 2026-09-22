import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
function load(file, mocks) {
  const absolute = path.resolve(root, file), exports = {};
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name);
    return load(base + '.ts', mocks);
  });
  return exports;
}
const user = randomUUID(), enrollment = randomUUID(), mission = randomUUID(), course = randomUUID();
function harness({ signedIn = true, active = true, visible = true, dbError = false, rpcError = null } = {}) {
  const calls = [];
  const db = { from(table) {
    const q = { select(...args) { calls.push(['select', table, ...args]); return this; }, eq(key, value) { calls.push(['eq', table, key, value]); return this; }, order() { return this; }, range(a,b) { calls.push(['range',a,b]); return this; },
      async maybeSingle() { return { data: table === 'enrollments' ? { id: enrollment, user_id: user, course_id: course, status: active ? 'active' : 'revoked' } : { id: mission, is_published: visible, curriculum_lessons: { id: randomUUID(), is_published: true, curriculum_weeks: { course_id: course, is_published: true, courses: { archived_at: null } } } }, error: dbError ? { message: 'private internal error' } : null }; },
      then(resolve) { return Promise.resolve({ data: [{ id: 'own-question', title: '내 질문' }], count: 21, error: null }).then(resolve); } };
    return q;
  }, async rpc(name,args) { calls.push(['rpc',name,args]); return { data: { id: 'saved-question' }, error: rpcError }; } };
  const api = load('features/mission/api/questions.ts', { '@/lib/server-auth': { getAuthenticatedUser: async () => signedIn ? { id: user } : null }, '@/lib/supabase/admin': { createAdminClient: () => db } });
  const get = query => api.readMissionQuestions(new Request(`https://example.test/api/mission/questions?enrollment=${enrollment}&mission=${mission}&${query || ''}`));
  const post = (body = {}, origin = 'https://example.test') => api.createMissionQuestion(new Request('https://example.test/api/mission/questions', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId: enrollment, missionId: mission, requestId: randomUUID(), title: ' 질문 ', content: ' 내용 ', ...body }) }));
  return { calls, get, post };
}
test('mission questions reject anonymous, expired/revoked and hidden access without writes or question reads', async () => {
  for (const [options,status] of [[{signedIn:false},401],[{active:false},403],[{visible:false},403]]) {
    const h=harness(options);assert.equal((await h.get()).status,status);assert.equal((await h.post()).status,status);
    assert.equal(h.calls.some(c=>c[0]==='rpc'||c[0]==='select'&&c[1]==='edu_questions'),false);
  }
  const h=harness();assert.equal((await h.post({},'https://other.test')).status,403);assert.equal(h.calls.length,0);
});
test('mission question reads scope owner and both context IDs, paginate and never expose other records', async () => {
  const h=harness(),response=await h.get('page=2');assert.equal(response.status,200);assert.equal((await response.json()).total,21);
  for(const [key,value] of [['user_id',user],['enrollment_id',enrollment],['mission_id',mission],['is_archived',false]])assert.ok(h.calls.some(c=>JSON.stringify(c)===JSON.stringify(['eq','edu_questions',key,value])));
  assert.ok(h.calls.some(c=>c[0]==='range'&&c[1]===20&&c[2]===39));
  assert.equal((await h.get('page=1.5')).status,400);
});
test('mission question write derives actor on server, validates input and preserves retry identity', async () => {
  const h=harness(),requestId=randomUUID();
  assert.equal((await h.post({userId:randomUUID(),courseId:randomUUID(),requestId})).status,200);
  assert.deepEqual(h.calls.find(c=>c[0]==='rpc').slice(1),['create_mission_question',{p_actor:user,p_request:requestId,p_enrollment:enrollment,p_mission:mission,p_title:'질문',p_content:'내용'}]);
  for(const body of [{title:''},{content:' '},{title:'a'.repeat(201)},{content:'a'.repeat(10001)},{missionId:'bad'},{requestId:null}])assert.equal((await harness().post(body)).status,400);
});
test('mission question failures remain failures without exposing database error details', async () => {
  const h=harness({dbError:true}),response=await h.get();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private internal/);
  assert.equal((await harness({rpcError:{code:'P0001',message:'private'}}).post()).status,409);
});
