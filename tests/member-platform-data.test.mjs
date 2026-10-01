import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const ruleExports = {};
const compiledRules = ts.transpileModule(fs.readFileSync(new URL('../lib/platform-rules.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', compiledRules)(ruleExports);
const cohortExports = {};
const cohortCode = ts.transpileModule(fs.readFileSync(new URL('../lib/cohort-curriculum-visibility.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', cohortCode)(cohortExports);

const overviewExports = {};
const overviewCode = ts.transpileModule(fs.readFileSync(new URL('../lib/learning-overview.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', 'require', overviewCode)(overviewExports, name => name === './platform-rules' ? ruleExports : name === './cohort-curriculum-visibility' ? cohortExports : assert.fail(name));

function harness(fixtures = {}, waitForRead = () => {}, rpcRead = async () => ({data: [], error: null})) {
  const calls = [], rpcCalls = [];
  const db = {
    rpc(name, args) {
      const call = {name, args}; rpcCalls.push(call);
      return { abortSignal(signal) { call.signal = signal; return rpcRead(args.p_enrollment); } };
    },
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
          return Promise.resolve(waitForRead(table)).then(() => ({ data, error: null })).then(resolve);
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
    if (name === '@/lib/alumni-access') return { isGraduate: () => false };
    if (name === '@/lib/learning-overview') return overviewExports;
    if (name === '@/lib/cohort-curriculum-visibility') return cohortExports;
    throw Error(name);
  });
  return { read: exports.readMemberPlatformData, calls, rpcCalls };
}

test('profile has no data prefetch and dashboard omits orders and review bodies', async () => {
  const profile = harness();
  assert.deepEqual(await profile.read('owner', 'profile'), {});
  assert.deepEqual(await profile.read('owner', 'messages'), {});
  assert.deepEqual(profile.calls, []);
  const dashboard = harness();
  await dashboard.read('owner', 'dashboard');
  assert.deepEqual(dashboard.calls.map(call => call.table), ['enrollments', 'edu_questions', 'customer_coupons']);
  assert.ok(dashboard.calls.every(call => call.filters.some(([key, value]) => key === 'user_id' && value === 'owner')));
});

test('dashboard starts independent owner-scoped reads before any one finishes', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const member = harness({}, () => blocked);
  const read = member.read('owner', 'dashboard');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(member.calls.map(call => call.table), ['enrollments', 'edu_questions', 'customer_coupons']);
  release();
  assert.deepEqual(await read, { enrollments: [], edu_questions: [], customer_coupons: [] });
});

test('enrolled dashboard starts independent curriculum and progress reads together', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const enrollment = { id: 'owned', user_id: 'owner', course_id: 'course', cohort_id: 'cohort', status: 'active', access_starts_at: new Date(Date.now() - 86400000).toISOString() };
  const member = harness({ enrollments: [enrollment] }, table => ['courses', 'cohorts', 'curriculum_weeks', 'lesson_progress', 'mission_submissions', 'cohort_sessions'].includes(table) ? blocked : undefined);
  const read = member.read('owner', 'dashboard');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(member.calls.map(call => call.table), [
    'enrollments', 'edu_questions', 'customer_coupons',
    'courses', 'cohorts', 'curriculum_weeks', 'lesson_progress', 'mission_submissions', 'cohort_sessions',
  ]);
  release();
  const result = await read;
  assert.equal(result.enrollments[0].id, 'owned');
  assert.deepEqual(result.lesson_progress, []);
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
    edu_cohort_week_visibility: [{ cohort_id: 'cohort', week_id: 'week', is_published: true }],
    edu_cohort_lesson_visibility: [{ cohort_id: 'cohort', lesson_id: 'lesson', is_published: true }],
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

test('a learner never receives another cohort\'s lesson body or resource list', async () => {
  const enrollment = { id: 'owned', user_id: 'owner', course_id: 'course', cohort_id: 'fourth', status: 'active', access_starts_at: new Date(Date.now() - 86400000).toISOString() };
  const fixtures = {
    enrollments: [enrollment], courses: [{ id: 'course' }], cohorts: [{ id: 'fourth' }],
    curriculum_weeks: [{ id: 'week', course_id: 'course', is_published: true }],
    curriculum_lessons: [{ id: 'lesson', week_id: 'week', is_published: true }],
    edu_cohort_week_visibility: [{ cohort_id: 'fifth', week_id: 'week', is_published: true }],
    edu_cohort_lesson_visibility: [{ cohort_id: 'fifth', lesson_id: 'lesson', is_published: true }],
    lesson_contents: [{ lesson_id: 'lesson', body_text: 'future cohort lesson' }],
  };
  const member = harness(fixtures);
  const result = await member.read('owner', 'learn', 'owned', 'lesson');
  assert.deepEqual(result.curriculum_weeks, []);
  assert.deepEqual(result.curriculum_lessons, undefined);
  assert.deepEqual(result.lesson_contents, undefined);
  assert.ok(!member.calls.some(call => call.table === 'lesson_contents'));
});

const owned = { id: 'owned', user_id: 'owner', course_id: 'course', cohort_id: 'cohort', status: 'active' };
const gate = { lessonId: 'lesson', track: 'daily', dayNumber: 1, isUnlocked: true, automaticApproval: false, reason: '' };
async function withFlag(run) {
  const previous = process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED;
  process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED = 'true';
  try { await run(); } finally { if(previous === undefined) delete process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED; else process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED=previous; }
}
test('gate reads are disabled by default and absent on unrelated member views', async () => {
  const previous=process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED;
  delete process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED;
  try { const f=harness({enrollments:[owned]}); await f.read('owner','dashboard'); assert.deepEqual(f.rpcCalls,[]); }
  finally { if(previous!==undefined)process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED=previous; }
  await withFlag(async()=>{for(const view of ['profile','messages','learn','resources','missions']){const f=harness({enrollments:[owned]});await f.read('owner',view,'owned');assert.deepEqual(f.rpcCalls,[]);}});
});
test('dashboard and classes read progression only for owned active enrollments and strip extra RPC fields', async () => withFlag(async()=>{
  for(const view of ['dashboard','classes']){
    const f=harness({enrollments:[owned,{...owned,id:'other',user_id:'another'},{...owned,id:'revoked',status:'revoked'},{...owned,id:'future',access_starts_at:'2099-01-01'}]},()=>{},async()=>({data:[{...gate,document:{private:'answer'}}],error:null}));
    const result=await f.read('owner',view);
    assert.equal(f.rpcCalls.length,1);assert.equal(f.rpcCalls[0].name,'edu_read_lesson_progression');
    assert.deepEqual(f.rpcCalls[0].args,{p_actor:'owner',p_enrollment:'owned'});assert.ok(f.rpcCalls[0].signal instanceof AbortSignal);
    assert.deepEqual(result.learning_overviews,[{id:'owned',status:'ready',lessons:[gate]}]);
  }
}));
test('failed and malformed progression reads affect only that enrollment and never expose error details', async () => withFlag(async()=>{
 const f=harness({enrollments:['owned','failure','malformed'].map(id=>({...owned,id}))},()=>{},async id=>id==='failure'?{error:{message:'private SQL error'},data:null}:{error:null,data:id==='malformed'?[{...gate,isUnlocked:'yes'}]:[gate]});
 const result=await f.read('owner','classes');
 assert.deepEqual(result.learning_overviews,[{id:'owned',status:'ready',lessons:[gate]},{id:'failure',status:'error'},{id:'malformed',status:'error'}]);
 assert.ok(!JSON.stringify(result).includes('private SQL'));assert.equal(new Set(f.rpcCalls.map(call=>call.signal)).size,1);
}));
test('progression reads start alongside curriculum reads without an extra serial round trip', async()=>withFlag(async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;});
 const f=harness({enrollments:[owned]},table=>table==='courses'?blocked:undefined,async()=>{await blocked;return{data:[gate],error:null};});
 const read=f.read('owner','classes');await new Promise(resolve=>setImmediate(resolve));
 assert.ok(f.calls.some(call=>call.table==='courses'));assert.equal(f.rpcCalls.length,1);
 release();assert.equal((await read).learning_overviews[0].status,'ready');
}));
