import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const customer = n => `k1:${String(n).padStart(43, 'x')}`;
const epoch = n => `ce_${String(n).padStart(32, 'e')}`;
async function fixture(t, extraMigrations=[]) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table profiles(id uuid primary key,status text default 'active',role text default 'student',is_internal boolean default false,deleted_at timestamptz);
    grant select,update on profiles to service_role;`);
  for (const file of ['20261008074257_edu_personalization_consent.sql','20261009115301_edu_tips_erasure_outbox_v2.sql','20261010011422_edu_tips_erasure_receipts_v2.sql',...extraMigrations]) {
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.exec("insert into edu_personalization_terms values('v1','Synthetic','Synthetic',now(),now(),true)");
  for (let n = 1; n <= 4; n++) {
    await db.query('insert into profiles(id) values($1)', [id(n)]);
    await db.query("insert into edu_tips_private.subjects(member_id,customer_id,consent_epoch,wording_version,consent_revision) values($1,$2,$3,'v1',$4)", [id(n),customer(n),epoch(n),id(10+n)]);
  }
  // Trigger real withdrawal path, then give synthetic timestamps an exact old reference.
  await db.exec("update profiles set status='withdrawn';update edu_tips_private.erasure_outbox set requested_at='2026-01-01T00:00:00Z',active_due_at='2099-01-01',model_due_at='2099-01-01',residual_due_at='2099-01-01'");
  await db.query("insert into edu_tips_private.erasure_consumers(id,environment,tenant_id,brand_id) values($1,'dev','brandyaction','brandyaction_edu'),($2,'production','brandyaction','brandyaction_edu')", [id(90),id(91)]);
  await db.exec('set role service_role');
  const value = async (sql, params=[]) => (await db.query(sql,params)).rows[0].v;
  const owner = async (sql,params=[]) => { await db.exec('reset role');try{return await db.query(sql,params);}finally{await db.exec('set role service_role');} };
  const publish = (consumer=90,limit=100) => value('select edu_tips_publish_erasures($1,$2) as v',[id(consumer),limit]);
  const deliveries = async (consumer=90) => (await db.query('select d.*,s.customer_id,s.consent_epoch from edu_tips_private.erasure_deliveries d join edu_tips_private.erasure_outbox q using(request_id) join edu_tips_private.subjects s on s.id=q.subject_id where d.consumer_id=$1 order by ordinal',[id(consumer)])).rows;
  const accept = (p,consumer=90) => value('select edu_tips_accept_erasure_receipt($1,$2::jsonb) as v',[id(consumer),JSON.stringify(p)]);
  const ack = (through,consumer=90) => value('select edu_tips_ack_erasures($1,$2) as v',[id(consumer),through]);
  return {db,value,owner,publish,deliveries,accept,ack};
}
function receipt(d,n=100,phase='completed',revision=1) {
  const rank = ['blocked','active_erased','model_resolved','completed'].indexOf(phase);
  return {requestId:d.request_id,receipt_id:id(n),receipt_revision:revision,customer_id:d.customer_id,consent_epoch:d.consent_epoch,phase,
    blocked_at:'2026-01-01T00:00:01.000Z',active_erased_at:rank>=1?'2026-01-01T00:00:02.000Z':null,
    model_resolved_at:rank>=2?'2026-01-01T00:00:03.000Z':null,residual_erased_at:rank>=3?'2026-01-01T00:00:04.000Z':null,
    observed_at:'2026-01-01T00:00:05.000Z',counts:{events:0,learning_rows:0,profiles:0,predictions:0,files:0,models:0},
    models:rank>=2?'not_applicable':'pending',residuals:rank>=3?'not_applicable':'pending',evidence_sha256:'a'.repeat(64),error_code:null};
}

export {id,customer,epoch,fixture,receipt};
