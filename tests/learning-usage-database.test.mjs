import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID as id } from 'node:crypto';
import { fixture } from './helpers/lesson-block-review.mjs';
const root=new URL('../supabase/migrations/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
async function setup({backfill=false,mode="self"}={}) {
 const f=await fixture({schemaVersion:1,blocks:[{id:'t',type:'text',content:'학습'}],checklist:[],completion:{mode,requireAnswers:false,requireQuizPass:false}}), session=id(),resource=id();
 await f.db.exec(`reset role;
 alter table courses add column metadata jsonb default '{}'; alter table cohorts add column name text default '4기';
 alter table lesson_contents add column vod_url text,add column resource_storage_path text,add column external_url text;
 create table cohort_sessions(id uuid primary key,cohort_id uuid references cohorts,title text,is_public boolean);
 create table cohort_session_contents(session_id uuid primary key references cohort_sessions,live_url text,replay_url text,resource_storage_path text);
 grant select,update,delete on cohort_sessions,cohort_session_contents to service_role;`);
 await f.db.query("insert into lesson_contents(lesson_id,vod_url,resource_storage_path) values($1,'https://video.test/lesson','lesson.pdf')",[f.lesson]);
 await f.db.query('update courses set metadata=$1 where id=$2',[{product_resources:[{id:resource,name:'추가 자료',path:'resource.pdf',scope:'enrolled'}]},f.course]);
 await f.db.query("insert into cohort_sessions values($1,$2,'첫 수업',true)",[session,f.cohort]);
 await f.db.query("insert into cohort_session_contents values($1,'https://live.test/room','https://replay.test/watch','session.pdf')",[session]);
 await f.db.exec(read('202608110004_learning_usage_evidence.sql'));
 await f.db.exec(read('20261001180000_cohort_curriculum_visibility.sql'));
 await f.db.exec('set role service_role');
 if(backfill){await f.draft({blocks:{},checklist:[]});await f.submit(undefined,{blocks:{},checklist:[]});}
 await f.db.exec('reset role');await f.db.exec(read('20261003074442_learning_usage_evidence_e3a.sql'));await f.db.exec('set role service_role');
 return {...f,session,resource,record:async(type,item=session,actor=f.student,enrollment=f.enrollment)=>f.db.query('select edu_record_learning_usage($1,$2,$3,$4)',[actor,enrollment,type,item]),report:async(actor=f.admin)=> (await f.db.query('select edu_admin_learning_usage($1,$2,1) as report',[actor,f.student])).rows[0].report};
}
test('migration backfills only real VOD completion, four types share distinct items and retain immutable first use',async()=>{
 const f=await setup({backfill:true});try{
 let rows=(await f.db.query('select * from learning_usage_events')).rows;assert.equal(rows.length,1);assert.equal(rows[0].evidence_source,'lesson_progress_backfill');
 const completed=(await f.db.query('select completed_at from lesson_progress')).rows[0].completed_at;assert.equal(String(rows[0].first_used_at),String(completed));
 for(const type of ['live_join','replay_view','material_download'])await f.record(type);
 await f.record('material_download',f.lesson);await f.record('material_download',f.resource);
 const before=(await f.db.query("select * from learning_usage_events where item_type='live_join'")).rows[0];
 await Promise.all(Array.from({length:8},()=>f.record('live_join')));
 const after=(await f.db.query("select * from learning_usage_events where item_type='live_join'")).rows[0];assert.equal(after.use_count,9);assert.equal(String(after.first_used_at),String(before.first_used_at));
 const report=await f.report();assert.equal(report.rows[0].items.length,6);assert.equal(report.rows[0].items.filter(x=>x.firstUsedAt).length,6);assert.equal(report.rows[0].compositionBasis,'current_registered_not_contract_snapshot');
 assert.doesNotMatch(JSON.stringify(report),/lesson\.pdf|session\.pdf|resource\.pdf|live\.test|replay\.test/);
 await f.db.query('update cohort_sessions set is_public=false where id=$1',[f.session]);await assert.rejects(f.record('live_join'),/USAGE_NOT_AVAILABLE/);
 await f.db.query('delete from cohort_session_contents where session_id=$1',[f.session]);const history=(await f.report()).rows[0];assert.equal(history.historicalItems.length,3);assert.equal(history.items.length,3);
 }finally{await f.db.close();}
});
test('completion trigger records committed self completion once, not a draft or incomplete progress',async()=>{
 const f=await setup();try{
 await f.draft({blocks:{},checklist:[]});assert.equal((await f.db.query('select * from learning_usage_events')).rows.length,0);
 await f.submit(undefined,{blocks:{},checklist:[]});assert.equal((await f.db.query("select * from learning_usage_events where item_type='vod_complete'")).rows.length,1);
 await f.db.query('update lesson_progress set completed_at=completed_at where enrollment_id=$1',[f.enrollment]);assert.equal((await f.db.query("select use_count from learning_usage_events where item_type='vod_complete'")).rows[0].use_count,1);
 await assert.rejects(f.record('vod_complete',f.lesson),/USAGE_INVALID/);
 }finally{await f.db.close();}
});
test('recording denies foreign, revoked, expired, unpublished and staff access; private evidence and RPCs reject browser roles',async()=>{
 const f=await setup();try{
 await assert.rejects(f.record('live_join',f.session,f.other),/USAGE_FORBIDDEN/);
 await assert.rejects(f.record('live_join',id()),/USAGE_NOT_AVAILABLE/);
 await f.db.query('update enrollments set access_ends_at=now()-interval \'1 day\' where id=$1',[f.enrollment]);await assert.rejects(f.record('live_join'),/USAGE_FORBIDDEN/);
 await f.db.query("update enrollments set access_ends_at=null,revoked_at=now() where id=$1",[f.enrollment]);await assert.rejects(f.record('live_join'),/USAGE_FORBIDDEN/);
 await f.db.query('update enrollments set revoked_at=null where id=$1',[f.enrollment]);
 await f.db.query("update profiles set role='staff' where id=$1",[f.student]);await assert.rejects(f.record('live_join'),/USAGE_FORBIDDEN/);
 await assert.rejects(f.report(f.other),/BLOCK_FORBIDDEN/);
 await f.db.query("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+f.student]);assert.equal((await f.report(f.student)).total,1);
 await f.db.query("update profiles set role='member' where id=$1",[f.student]);await f.db.query('update edu_cohort_lesson_visibility set is_published=false where cohort_id=$1',[f.cohort]);await assert.rejects(f.record('material_download',f.lesson),/USAGE_NOT_AVAILABLE/);
 for(const role of ['anon','authenticated']){await f.db.exec('reset role;set role '+role);await assert.rejects(f.db.query('select * from learning_usage_events'),/permission denied/);await assert.rejects(f.record('live_join'),/permission denied/);await assert.rejects(f.report(),/permission denied/);}
 }finally{await f.db.close();}
});

test('mentor submission creates no VOD evidence until actual approval commits progress',async()=>{
 const f=await setup({mode:'mentor'});try{
 await f.draft({blocks:{},checklist:[]});const s=await f.submit(undefined,{blocks:{},checklist:[]});
 assert.equal((await f.db.query('select * from learning_usage_events')).rows.length,0);
 await f.db.query('select edu_decide_lesson_blocks($1,$2,$3,$4,$5,$6)',[f.admin,s.id,s.stateId,id(),'approved','확인']);
 assert.equal((await f.db.query("select count(*)::int as n from learning_usage_events where item_type='vod_complete'")).rows[0].n,1);
 }finally{await f.db.close();}
});
