import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

// Execute the real migration and RPC in an isolated PostgreSQL engine. This
// synthetic dependency schema intentionally contains no production data or URL.
const db = new PGlite();
const sql = fs.readFileSync(new URL('../supabase/migrations/202609200001_conversion_review.sql', import.meta.url), 'utf8');
const permissionsSql = fs.readFileSync(new URL('../supabase/migrations/202609200002_conversion_review_permissions.sql', import.meta.url), 'utf8');
const jevSql = fs.readFileSync(new URL('../supabase/migrations/202609220001_conversion_jev_shadow.sql', import.meta.url), 'utf8');
const calibrationSql = fs.readFileSync(new URL('../supabase/migrations/202609220002_conversion_jev_calibration.sql', import.meta.url), 'utf8');
const sampleScopeSql = fs.readFileSync(new URL('../supabase/migrations/202609220003_conversion_jev_sample_scope.sql', import.meta.url), 'utf8');
const legacySampleSql = fs.readFileSync(new URL('../supabase/migrations/202609230001_conversion_legacy_samples.sql', import.meta.url), 'utf8');
const adjudicationSql = fs.readFileSync(new URL('../supabase/migrations/202609230002_conversion_adjudication_notes.sql', import.meta.url), 'utf8');
const jevV2Sql = fs.readFileSync(new URL('../supabase/migrations/202609230003_conversion_jev_v2_runs.sql', import.meta.url), 'utf8');
const jevV3Sql = fs.readFileSync(new URL('../supabase/migrations/202609230004_conversion_jev_v3_runs.sql', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../lib/conversion-review-server.ts', import.meta.url), 'utf8');
const serverExports = {};
new Function('exports', 'require', ts.transpileModule(serverSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(serverExports, name => {
  assert.equal(name, 'node:crypto'); return { createHash };
});
const { conversionPayload } = serverExports;
const ids = Object.fromEntries(['admin', 'staff', 'student', 'course', 'otherCourse', 'cohort', 'otherCohort', 'question'].map(name => [name, randomUUID()]));
const tables = ['edu_conversion_reviews', 'edu_conversion_runs', 'edu_conversion_receipts', 'edu_conversion_cases', 'edu_conversion_evidence'];
const sampleReply = '승인된 초보자 수강 안내입니다.';
const mock = { mode: 'mock', requires_human_review: true, proposed_reply: sampleReply };

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    -- Hosted Supabase grants new public tables to these roles by default.
    -- Test the migration against those inherited ACLs, not empty local grants.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table public.profiles (id uuid primary key, role text not null, status text not null default 'active');
    create table public.site_settings (key text primary key, value jsonb not null);
    create table public.courses (id uuid primary key);
    create table public.cohorts (id uuid primary key, course_id uuid not null references public.courses(id));
    create table public.edu_questions (
      id uuid primary key, user_id uuid not null references public.profiles(id), course_id uuid references public.courses(id),
      title text not null, content text not null, answer text, status text not null default 'open',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      is_archived boolean not null default false
    );
  `);
  await db.exec(sql);
  await db.exec(permissionsSql);
  await db.exec(jevSql);
  await db.exec(calibrationSql);
  await db.exec(sampleScopeSql);
  await db.exec(legacySampleSql);
  await db.exec(adjudicationSql);
  await db.exec(jevV2Sql);
  await db.exec(jevV3Sql);
  await db.query('insert into profiles(id,role) values ($1,\'admin\'),($2,\'staff\'),($3,\'student\')', [ids.admin, ids.staff, ids.student]);
  await db.query('insert into courses(id) values ($1),($2)', [ids.course, ids.otherCourse]);
  await db.query('insert into cohorts(id,course_id) values ($1,$2),($3,$4)', [ids.cohort, ids.course, ids.otherCohort, ids.otherCourse]);
  await db.query(`insert into edu_questions(id,user_id,course_id,title,content,created_at,updated_at)
    values ($1,$2,$3,'원래 제목','초보자도 수강할 수 있나요?','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`, [ids.question, ids.student, ids.course]);
});
beforeEach(async () => {
  await db.exec(`truncate edu_conversion_jev_v3_runs,edu_conversion_jev_v2_runs,edu_conversion_adjudication_notes,${tables.join(',')};`);
  await db.exec("update profiles set status='active'; delete from site_settings;");
  await db.query('insert into site_settings(key,value) values ($1,$2)', [`edu_staff_permissions_${ids.staff}`, { members: true, products: true }]);
  await db.query(`update edu_questions set title='원래 제목',content='초보자도 수강할 수 있나요?',answer=null,
    status='open',course_id=$2,user_id=$3,updated_at='2026-01-01T00:00:00Z',is_archived=false where id=$1`, [ids.question, ids.course, ids.student]);
});
after(async () => { await db.close(); });

function manual(overrides = {}) {
  return { action: 'save_case', requestId: randomUUID(), course_id: ids.course, cohort_id: ids.cohort,
    subject: '외부 문의', content: '초보자 수강 기준을 알려 주세요.', source_label: '운영자 등록 발췌', received_at: '2026-01-01T00:00:00Z', deidentified_confirmed: true, ...overrides };
}
function evidence(overrides = {}) {
  return { action: 'save_evidence', requestId: randomUUID(), course_id: ids.course, cohort_id: null,
    title: '수강 기준', body: sampleReply, source_url: 'https://edu.example/classes/course', status: 'approved', ...overrides };
}
async function rpc(input, options = {}) {
  const request = options.normalized || conversionPayload(input);
  await db.exec('set role service_role');
  try {
    const result = await db.query(`select public.edu_conversion_mutate($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::jsonb,$8::integer) as result`,
      [options.actor || ids.admin, request.requestId, request.action, request.payload, request.payload_hash,
        options.result ?? null, options.versions ?? null, options.observedVersion ?? null]);
    return result.rows[0].result;
  } finally { await db.exec('reset role'); }
}
async function count(table) { return (await db.query(`select count(*)::integer as count from ${table}`)).rows[0].count; }
async function setupRun(input = manual()) {
  const { case: inquiry } = await rpc(input);
  const { evidence: item } = await rpc(evidence());
  const versions = { [item.id]: item.version };
  const analyze = { action: 'analyze', requestId: randomUUID(), case_id: inquiry.id, expected_version: inquiry.input_version };
  const { run } = await rpc(analyze, { result: mock, versions, observedVersion: inquiry.input_version });
  return { inquiry, item, versions, analyze, run };
}
function review(inquiry, run, overrides = {}) {
  return { action: 'review', requestId: randomUUID(), case_id: inquiry.id, run_id: run.id, decision: 'accept', reply_text: sampleReply, reason: '', ...overrides };
}

test('RPC retry returns one stored result; changed intent with the same request ID is rejected', async () => {
  const input = manual();
  const first = await rpc(input);
  assert.deepEqual(await rpc(input), first);
  assert.equal(await count('edu_conversion_cases'), 1);
  assert.equal(await count('edu_conversion_receipts'), 1);
  await assert.rejects(rpc({ ...input, content: '다른 문의입니다.' }), /CONVERSION_REQUEST_REUSED/);
  // A dishonest hash cannot hide a changed normalized payload from the RPC.
  const changed = conversionPayload({ ...input, content: '위조된 동일 해시' });
  changed.payload_hash = conversionPayload(input).payload_hash;
  await assert.rejects(rpc(null, { normalized: changed }), /CONVERSION_REQUEST_REUSED/);
  assert.equal(await count('edu_conversion_cases'), 1);
});

test('historical paid-education inquiry can be calibrated without inventing a current product or cohort', async () => {
  const input = manual({ course_id: null, cohort_id: null, sample_origin: 'external_legacy', legacy_course_label: '과거 온라인 마케팅 교육' });
  const { case: inquiry } = await rpc(input);
  assert.equal(inquiry.course_id, null);
  assert.equal(inquiry.sample_origin, 'external_legacy');
  assert.equal(inquiry.legacy_course_label, '과거 온라인 마케팅 교육');
  assert.equal(inquiry.customer_id, null);
  const runResult = { ...mock, proposed_reply: '' };
  const { run } = await rpc({ action: 'analyze', requestId: randomUUID(), case_id: inquiry.id, expected_version: inquiry.input_version },
    { result: runResult, versions: {}, observedVersion: inquiry.input_version });
  assert.deepEqual(run.evidence_versions, {});
  assert.deepEqual(run.evidence_snapshot, []);
  assert.equal(run.input_snapshot.sample_origin, 'external_legacy');
  assert.equal(run.input_snapshot.legacy_course_label, '과거 온라인 마케팅 교육');
  await assert.rejects(rpc({ ...input, requestId: randomUUID(), id: inquiry.id, expected_version: inquiry.input_version,
    sample_origin: 'current', course_id: ids.course, legacy_course_label: null }), /CONVERSION_INVALID/);
  for (const invalid of [
    manual({ course_id: null }),
    manual({ course_id: null, cohort_id: ids.cohort, sample_origin: 'external_legacy', legacy_course_label: '과거 온라인 마케팅 교육' }),
    manual({ course_id: null, cohort_id: null, sample_origin: 'external_legacy', legacy_course_label: '' }),
  ]) {
    await assert.rejects(rpc(invalid));
  }
});

test('separate adjudication history is append-only for browser roles and linked to the original review', async () => {
  const { inquiry, run } = await setupRun();
  const { review: first } = await rpc(review(inquiry, run));
  const protections = await db.query("select relrowsecurity from pg_class where relname='edu_conversion_adjudication_notes'");
  assert.equal(protections.rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from edu_conversion_adjudication_notes'), /permission denied/);
      await assert.rejects(db.query("insert into edu_conversion_adjudication_notes(run_id,calibration_review_id,dimension,assessment,basis,rationale,actor_id,request_id,payload_hash) values (gen_random_uuid(),gen_random_uuid(),'purchase_readiness','both_plausible','interpretation','구체적인 결제 행동은 확인되지 않았습니다.',gen_random_uuid(),gen_random_uuid(),repeat('a',64))"), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try {
    await db.query("insert into edu_conversion_adjudication_notes(run_id,calibration_review_id,dimension,assessment,basis,rationale,actor_id,request_id,payload_hash) values ($1,$2,'purchase_readiness','both_plausible','interpretation','구체적인 결제 행동은 확인되지 않았습니다.',$3,$4,$5)", [run.id, first.id, ids.admin, randomUUID(), 'a'.repeat(64)]);
  } finally { await db.exec('reset role'); }
  assert.equal(await count('edu_conversion_adjudication_notes'), 1);
  assert.equal(await count('edu_conversion_reviews'), 1);
});

test('v2 experiment rows are separate, unique per v1 run, and inaccessible to browser roles', async () => {
  const { inquiry, run } = await setupRun();
  const { review: first } = await rpc(review(inquiry, run));
  const rls = await db.query("select relrowsecurity from pg_class where relname='edu_conversion_jev_v2_runs'");
  assert.equal(rls.rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select * from edu_conversion_jev_v2_runs'), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try {
    const args = [run.id, inquiry.id, first.id, inquiry.input_version, ids.admin];
    await db.query("insert into edu_conversion_jev_v2_runs(v1_run_id,case_id,calibration_review_id,input_version,status,actor_id) values ($1,$2,$3,$4,'pending',$5)", args);
    await assert.rejects(db.query("insert into edu_conversion_jev_v2_runs(v1_run_id,case_id,calibration_review_id,input_version,status,actor_id) values ($1,$2,$3,$4,'pending',$5)", args), /unique/);
    await assert.rejects(db.query("update edu_conversion_jev_v2_runs set status='completed' where v1_run_id=$1", [run.id]), /check constraint/);
    await db.query("update edu_conversion_jev_v2_runs set status='completed',result=$2 where v1_run_id=$1", [run.id, { contract_version: 2, model: 'jev-test' }]);
  } finally { await db.exec('reset role'); }
  assert.equal(await count('edu_conversion_jev_v2_runs'), 1);
  assert.equal(await count('edu_conversion_runs'), 1);
  assert.equal(await count('edu_conversion_reviews'), 1);
});

test('v3 experiment rows preserve v2 and the first review, enforce uniqueness, and deny browser roles', async () => {
  const { inquiry, run } = await setupRun();
  const { review: first } = await rpc(review(inquiry, run));
  const rls = await db.query("select relrowsecurity from pg_class where relname='edu_conversion_jev_v3_runs'");
  assert.equal(rls.rows[0].relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try { await assert.rejects(db.query('select * from edu_conversion_jev_v3_runs'), /permission denied/); }
    finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try {
    const args = [run.id, inquiry.id, first.id, inquiry.input_version, ids.admin];
    await db.query("insert into edu_conversion_jev_v3_runs(v1_run_id,case_id,calibration_review_id,input_version,status,actor_id) values ($1,$2,$3,$4,'pending',$5)", args);
    await assert.rejects(db.query("insert into edu_conversion_jev_v3_runs(v1_run_id,case_id,calibration_review_id,input_version,status,actor_id) values ($1,$2,$3,$4,'pending',$5)", args), /unique/);
    await assert.rejects(db.query("update edu_conversion_jev_v3_runs set status='completed' where v1_run_id=$1", [run.id]), /check constraint/);
    await db.query("update edu_conversion_jev_v3_runs set status='completed',result=$2 where v1_run_id=$1", [run.id, { contract_version: 3, model: 'jev-test' }]);
    await assert.rejects(db.query("delete from edu_conversion_jev_v3_runs where v1_run_id=$1", [run.id]), /permission denied/);
  } finally { await db.exec('reset role'); }
  assert.equal(await count('edu_conversion_jev_v3_runs'), 1);
  assert.equal(await count('edu_conversion_jev_v2_runs'), 0);
  assert.equal(await count('edu_conversion_runs'), 1);
  assert.equal(await count('edu_conversion_reviews'), 1);
});

test('active staff need members scope and evidence additionally needs products scope', async () => {
  await db.query('update site_settings set value=$1', [{ members: false, products: true }]);
  await assert.rejects(rpc(manual(), { actor: ids.staff }), /CONVERSION_FORBIDDEN/);
  await db.query('update site_settings set value=$1', [{ members: true, products: false }]);
  assert.ok((await rpc(manual(), { actor: ids.staff })).case.id);
  await assert.rejects(rpc(evidence(), { actor: ids.staff }), /CONVERSION_FORBIDDEN/);
  await assert.rejects(rpc(manual(), { actor: ids.student }), /CONVERSION_FORBIDDEN/);
  await db.query("update profiles set status='suspended' where id=$1", [ids.admin]);
  await assert.rejects(rpc(manual()), /CONVERSION_FORBIDDEN/);
  assert.equal(await count('edu_conversion_receipts'), 1);
});

test('native inquiry fields and customer come from the original; manual customer stays null', async () => {
  const raw = manual({ question_id: ids.question, subject: '위조 제목', content: '위조 본문', customer_id: ids.admin });
  const normalized = conversionPayload(raw);
  // Exercise the database boundary too, beyond the API normalizer.
  normalized.payload = { ...normalized.payload, subject: '위조 제목', content: '위조 본문', customer_id: ids.admin };
  const { case: native } = await rpc(null, { normalized });
  assert.equal(native.subject, '원래 제목');
  assert.equal(native.content, '초보자도 수강할 수 있나요?');
  assert.equal(native.customer_id, ids.student);
  assert.equal(native.source_label, '사이트 문의');
  assert.equal(new Date(native.received_at).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal('source_revision' in native, false);
  const { case: external } = await rpc(manual({ customer_id: ids.admin }));
  assert.equal(external.customer_id, null);
  assert.equal(external.question_id, null);
  assert.equal(external.source_type, 'manual');
  assert.equal((await db.query('select answer from edu_questions where id=$1', [ids.question])).rows[0].answer, null);
});

test('wrong course/cohort and mismatched native course fail without leaving receipts', async () => {
  await assert.rejects(rpc(manual({ cohort_id: ids.otherCohort })), /CONVERSION_INVALID/);
  await assert.rejects(rpc(evidence({ cohort_id: ids.otherCohort })), /CONVERSION_INVALID/);
  await assert.rejects(rpc(manual({ question_id: ids.question, course_id: ids.otherCourse, cohort_id: null })), /CONVERSION_INVALID/);
  await assert.rejects(rpc(manual({ course_id: randomUUID(), cohort_id: null })), /CONVERSION_NOT_FOUND/);
  for (const table of tables) assert.equal(await count(table), 0);
});

test('analysis validates the complete approved candidate snapshot and both input versions', async () => {
  const { inquiry, item, versions } = await setupRun();
  await rpc(evidence({ course_id: ids.otherCourse, cohort_id: ids.otherCohort }));
  await rpc(evidence({ status: 'draft' }));
  const analyze = { action: 'analyze', requestId: randomUUID(), case_id: inquiry.id, expected_version: 1 };
  const good = await rpc(analyze, { result: mock, versions, observedVersion: 1 });
  assert.deepEqual(good.run.evidence_versions, { [item.id]: 1 });
  await assert.rejects(rpc({ ...analyze, requestId: randomUUID() }, { result: mock, versions: {}, observedVersion: 1 }), /CONVERSION_STALE/);
  await assert.rejects(rpc({ ...analyze, requestId: randomUUID() }, { result: mock, versions, observedVersion: 2 }), /CONVERSION_STALE/);
  await assert.rejects(rpc({ ...analyze, requestId: randomUUID(), expected_version: 2 }, { result: mock, versions, observedVersion: 1 }), /CONVERSION_STALE/);
  assert.equal(await count('edu_conversion_runs'), 2);
});

test('analysis stores Jev shadow results under the matching provider without weakening review requirements', async () => {
  const { case: inquiry } = await rpc(manual());
  const analyze = { action: 'analyze', requestId: randomUUID(), case_id: inquiry.id, expected_version: 1 };
  const result = { mode: 'jev', model: 'jev-test', requires_human_review: true, proposed_reply: '', decisions: {} };
  const { run } = await rpc(analyze, { result, versions: {}, observedVersion: 1 });
  assert.equal(run.provider, 'jev');
  assert.equal(run.result.mode, 'jev');
  await assert.rejects(rpc({ ...analyze, requestId: randomUUID() }, { result: { ...result, requires_human_review: false }, versions: {}, observedVersion: 1 }), /CONVERSION_INVALID/);
});

test('Jev review requires one independent calibration while mock review rejects it', async () => {
  const { case: inquiry } = await rpc(manual());
  const analyze = { action: 'analyze', requestId: randomUUID(), case_id: inquiry.id, expected_version: 1 };
  const jevResult = { mode: 'jev', model: 'jev-test', requires_human_review: true, proposed_reply: '', decisions: {} };
  const { run } = await rpc(analyze, { result: jevResult, versions: {}, observedVersion: 1 });
  const base = { action: 'review', requestId: randomUUID(), case_id: inquiry.id, run_id: run.id,
    decision: 'hold', reply_text: '', reason: '독립 판정', calibration: null, calibration_sample_kind: null };
  await assert.rejects(rpc(base), /CONVERSION_INVALID/);
  const calibration = { purchase_intent: 'high', primary_barrier: 'price', purchase_readiness: 3, next_action: 'offer_purchase_info' };
  const saved = await rpc({ ...base, requestId: randomUUID(), calibration, calibration_sample_kind: 'operational' });
  assert.deepEqual(saved.review.calibration, calibration);
  assert.equal(saved.review.calibration_sample_kind, 'operational');
  await assert.rejects(rpc({ ...base, requestId: randomUUID(), calibration, calibration_sample_kind: 'operational' }), /CONVERSION_INVALID/);
  assert.ok((await rpc({ ...base, requestId: randomUUID(), reason: '후속 검토' })).review.id);

  const mockRun = await setupRun();
  await assert.rejects(rpc(review(mockRun.inquiry, mockRun.run, { calibration, calibration_sample_kind: 'test' })), /CONVERSION_INVALID/);
});

test('native inquiry edits or archival invalidate analysis and review before any write', async () => {
  const { inquiry, run, versions, analyze } = await setupRun(manual({ question_id: ids.question }));
  await db.query("update edu_questions set content='변경된 문의' where id=$1", [ids.question]);
  await assert.rejects(rpc({ ...analyze, requestId: randomUUID() }, { result: mock, versions, observedVersion: 1 }), /CONVERSION_STALE/);
  await assert.rejects(rpc(review(inquiry, run)), /CONVERSION_STALE/);
  await db.query("update edu_questions set content='초보자도 수강할 수 있나요?',is_archived=true where id=$1", [ids.question]);
  await assert.rejects(rpc(review(inquiry, run)), /CONVERSION_STALE/);
  assert.equal(await count('edu_conversion_runs'), 1);
  assert.equal(await count('edu_conversion_reviews'), 0);
});

test('edited evidence and newly approved evidence each invalidate an existing run', async () => {
  const first = await setupRun();
  await rpc(evidence({ id: first.item.id, expected_version: 1, body: '수정된 승인 안내' }));
  await assert.rejects(rpc(review(first.inquiry, first.run)), /CONVERSION_STALE/);
  await assert.rejects(rpc({ ...first.analyze, requestId: randomUUID() }, { result: mock, versions: first.versions, observedVersion: 1 }), /CONVERSION_STALE/);
  const currentVersions = { [first.item.id]: 2 };
  const { run } = await rpc({ ...first.analyze, requestId: randomUUID() }, { result: mock, versions: currentVersions, observedVersion: 1 });
  await rpc(evidence({ title: '새 승인 자료' }));
  await assert.rejects(rpc(review(first.inquiry, run)), /CONVERSION_STALE/);
  await assert.rejects(rpc({ ...first.analyze, requestId: randomUUID() }, { result: mock, versions: currentVersions, observedVersion: 1 }), /CONVERSION_STALE/);
  assert.equal(await count('edu_conversion_reviews'), 0);
});

test('accept cannot silently change the proposal; review retry is idempotent and never sends a reply', async () => {
  const { inquiry, run } = await setupRun(manual({ question_id: ids.question }));
  await assert.rejects(rpc(review(inquiry, run, { reply_text: '동의 없는 변경 내용' })), /CONVERSION_INVALID/);
  const input = review(inquiry, run);
  const accepted = await rpc(input);
  assert.deepEqual(await rpc(input), accepted);
  assert.equal(await count('edu_conversion_reviews'), 1);
  const original = (await db.query('select answer,status from edu_questions where id=$1', [ids.question])).rows[0];
  assert.deepEqual(original, { answer: null, status: 'open' });
  await rpc(manual({ id: inquiry.id, expected_version: 1, question_id: ids.question }));
  await assert.rejects(rpc(review(inquiry, run)), /CONVERSION_STALE/);
});

test('failed mutation atomically rolls back its receipt and allows a corrected retry', async () => {
  const { inquiry, versions } = await setupRun();
  const request = { action: 'analyze', requestId: randomUUID(), case_id: inquiry.id, expected_version: 1 };
  const beforeReceipts = await count('edu_conversion_receipts');
  await assert.rejects(rpc(request, { result: { mode: 'mock', requires_human_review: false }, versions, observedVersion: 1 }), /CONVERSION_INVALID/);
  assert.equal(await count('edu_conversion_receipts'), beforeReceipts);
  assert.equal(await count('edu_conversion_runs'), 1);
  assert.ok((await rpc(request, { result: mock, versions, observedVersion: 1 })).run.id);
  assert.equal(await count('edu_conversion_receipts'), beforeReceipts + 1);
});

test('run retains original inquiry and evidence content after later operator edits', async () => {
  const { inquiry, item, run } = await setupRun();
  assert.equal(run.input_snapshot.id, inquiry.id);
  assert.equal(run.input_snapshot.content, inquiry.content);
  assert.equal(run.input_snapshot.input_version, 1);
  assert.equal(run.evidence_snapshot.length, 1);
  assert.equal(run.evidence_snapshot[0].id, item.id);
  assert.equal(run.evidence_snapshot[0].body, sampleReply);
  assert.equal(run.evidence_snapshot[0].source_url, item.source_url);
  await rpc(manual({ id: inquiry.id, expected_version: 1, content: '나중에 수정한 문의' }));
  await rpc(evidence({ id: item.id, expected_version: 1, body: '나중에 수정한 자료', status: 'retired' }));
  const stored = (await db.query('select input_snapshot,evidence_snapshot from edu_conversion_runs where id=$1', [run.id])).rows[0];
  assert.deepEqual(stored.input_snapshot, run.input_snapshot);
  assert.deepEqual(stored.evidence_snapshot, run.evidence_snapshot);
  // Source content belongs to this historical run, never a lookup of live rows.
  assert.equal(stored.input_snapshot.content, inquiry.content);
  assert.equal(stored.evidence_snapshot[0].version, 1);
  assert.equal(stored.evidence_snapshot[0].status, 'approved');
});

test('RLS and grants block browser roles and direct service writes; only the RPC can mutate', async () => {
  const protections = await db.query("select relname,relrowsecurity from pg_class where relname = any($1::text[])", [tables]);
  assert.equal(protections.rows.length, tables.length);
  assert.ok(protections.rows.every(row => row.relrowsecurity));
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      for (const table of tables) await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
      await assert.rejects(db.query("select edu_conversion_mutate(null,null,'save_case','{}',null,null,null,null)"), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try {
    for (const table of tables.filter(table => table !== 'edu_conversion_receipts')) {
      await db.query(`select * from ${table}`);
    }
    await assert.rejects(db.query('select * from edu_conversion_receipts'), /permission denied/);
    for (const table of tables) {
      for (const statement of [`insert into ${table} default values`, `update ${table} set created_at=now()`, `delete from ${table}`, `truncate ${table} cascade`]) {
        await assert.rejects(db.query(statement), /permission denied/);
      }
    }
  } finally { await db.exec('reset role'); }
});
