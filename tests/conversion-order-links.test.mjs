import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = fs.readFileSync(new URL('../supabase/migrations/202609250002_conversion_case_order_links.sql', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../lib/conversion-review-server.ts', import.meta.url), 'utf8');
const exports = {};
new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, name => {
  assert.equal(name, 'node:crypto'); return { createHash };
});
const { conversionPayload } = exports;
const ids = Object.fromEntries(['admin', 'staff', 'course', 'otherCourse', 'cohort', 'otherCohort', 'inquiry', 'order', 'otherOrder'].map(key => [key, randomUUID()]));

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table profiles(id uuid primary key,role text not null,status text not null default 'active');
    create table site_settings(key text primary key,value jsonb not null);
    create table courses(id uuid primary key);
    create table cohorts(id uuid primary key,course_id uuid not null references courses(id));
    create table edu_conversion_cases(
      id uuid primary key,source_type text not null,sample_origin text not null,course_id uuid references courses(id),
      cohort_id uuid references cohorts(id),received_at timestamptz not null,input_version integer not null default 1,
      archived_at timestamptz,purchase_outcome text not null default 'unknown'
    );
    create table edu_conversion_receipts(actor_id uuid not null,request_id uuid not null,action text not null,payload_hash text not null,payload jsonb not null,result jsonb,created_at timestamptz not null default now(),primary key(actor_id,request_id));
    create table orders(id uuid primary key,status text not null,paid_at timestamptz);
    create table order_items(order_id uuid not null references orders(id),course_id uuid not null references courses(id),cohort_id uuid not null references cohorts(id));
  `);
  await db.exec(migration);
  await db.query('insert into profiles(id,role) values($1,\'admin\'),($2,\'staff\')', [ids.admin, ids.staff]);
  await db.query('insert into courses(id) values($1),($2)', [ids.course, ids.otherCourse]);
  await db.query('insert into cohorts(id,course_id) values($1,$2)', [ids.cohort, ids.course]);
  await db.query('insert into cohorts(id,course_id) values($1,$2)', [ids.otherCohort, ids.otherCourse]);
  await db.query(`insert into edu_conversion_cases(id,source_type,sample_origin,course_id,cohort_id,received_at) values($1,'manual','current',$2,$3,'2026-09-20T00:00:00Z')`, [ids.inquiry, ids.course, ids.cohort]);
  await db.query("insert into site_settings(key,value) values($1,$2)", [`edu_staff_permissions_${ids.staff}`, { members: true, orders: true, marketing: true }]);
  await db.query("insert into orders(id,status,paid_at) values($1,'paid','2026-09-21T00:00:00Z'),($2,'paid','2026-09-21T00:00:00Z')", [ids.order, ids.otherOrder]);
  await db.query('insert into order_items(order_id,course_id,cohort_id) values($1,$2,$3),($4,$5,$6)', [ids.order, ids.course, ids.cohort, ids.otherOrder, ids.otherCourse, ids.otherCohort]);
});
after(async () => db.close());

async function manage(input, actor = ids.staff) {
  const parsed = conversionPayload(input);
  return (await db.query('select public.edu_conversion_case_order_manage($1::uuid,$2::uuid,$3::jsonb,$4::text) as result', [actor, parsed.requestId, parsed.payload, parsed.payload_hash])).rows[0].result;
}

test('an employee can link a paid order to the correct current inquiry and undo the link', async () => {
  const link = { action: 'manage_case_order', operation: 'link', requestId: randomUUID(), case_id: ids.inquiry, expected_version: 1, order_id: ids.order };
  const saved = await manage(link);
  assert.equal(saved.operation, 'link');
  const rows = await db.query('select case_id,order_id,linked_by from edu_conversion_case_orders');
  assert.deepEqual(rows.rows[0], { case_id: ids.inquiry, order_id: ids.order, linked_by: ids.staff });
  assert.equal((await db.query('select purchase_outcome from edu_conversion_cases where id=$1', [ids.inquiry])).rows[0].purchase_outcome, 'unknown');
  const unlink = { ...link, operation: 'unlink', order_id: ids.order, requestId: randomUUID() };
  await manage(unlink);
  assert.equal((await db.query('select count(*)::integer as count from edu_conversion_case_orders')).rows[0].count, 0);
});

test('a single paid order cannot be attributed to multiple inquiry records', async () => {
  const first = { action: 'manage_case_order', operation: 'link', requestId: randomUUID(), case_id: ids.inquiry, expected_version: 1, order_id: ids.order };
  await manage(first);
  const otherCase = randomUUID();
  await db.query(`insert into edu_conversion_cases(id,source_type,sample_origin,course_id,cohort_id,received_at) values($1,'manual','current',$2,$3,'2026-09-20T00:00:00Z')`, [otherCase, ids.course, ids.cohort]);
  await assert.rejects(manage({ ...first, requestId: randomUUID(), case_id: otherCase }), /CONVERSION_ORDER_ALREADY_LINKED/);
});

test('orders with the wrong product and non-current inquiries cannot be linked', async () => {
  const historical = randomUUID();
  await db.query(`insert into edu_conversion_cases(id,source_type,sample_origin,course_id,cohort_id,received_at) values($1,'manual','external_legacy',null,null,'2026-09-20T00:00:00Z')`, [historical]);
  const base = { action: 'manage_case_order', operation: 'link', requestId: randomUUID(), expected_version: 1, order_id: ids.order };
  await assert.rejects(manage({ ...base, case_id: historical }), /CONVERSION_INVALID/);
  await assert.rejects(manage({ ...base, case_id: ids.inquiry, order_id: ids.otherOrder }), /CONVERSION_ORDER_SCOPE/);
  await assert.rejects(manage({ ...base, case_id: ids.inquiry, order_id: randomUUID() }), /CONVERSION_ORDER_NOT_ELIGIBLE/);
});

test('staff without order and marketing access are rejected inside the database function', async () => {
  await db.query('delete from site_settings where key=$1', [`edu_staff_permissions_${ids.staff}`]);
  const input = { action: 'manage_case_order', operation: 'link', requestId: randomUUID(), case_id: ids.inquiry, expected_version: 1, order_id: ids.order };
  await assert.rejects(manage(input), /CONVERSION_FORBIDDEN/);
});
