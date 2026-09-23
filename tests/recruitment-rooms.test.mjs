import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
const exports = {};
new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/recruitment-rooms.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const sample = {label:'Synthetic recruitment',organicUrl:'https://open.kakao.com/o/organicTest',paidUrl:'https://open.kakao.com/o/paidTest',paidMode:'undecided'};
test('room URLs reject lookalike hosts, query data, duplicate rooms and bad campaign keys',()=>{
 assert.deepEqual(exports.recruitmentRooms({...sample,organicUrl:sample.organicUrl+'/'}),sample);
 for(const url of ['http://open.kakao.com/o/test','https://open.kakao.com.evil.test/o/test','https://open.kakao.com/o/test?secret=x',sample.organicUrl]) assert.throws(()=>exports.recruitmentRooms({...sample,paidUrl:url}));
 for(const key of ['', '../foo', 'A', 'x'.repeat(65)]) assert.throws(()=>exports.recruitmentPeriod(key));
 assert.equal(exports.recruitmentPeriod('sample-2026-09'),'sample-2026-09');
 assert.throws(()=>exports.recruitmentRooms({...sample,paidMode:'auto-create'}));
});
test('period revisions isolate reused rooms, preserve prior destinations and enforce authorization and idempotency',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 create table profiles(id uuid primary key,role text,status text);
 create table site_settings(key text primary key,value jsonb);`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/202609210003_recruitment_room_settings.sql',import.meta.url),'utf8'));
 const actor=randomUUID(),staff=randomUUID(),request=randomUUID();
 await db.query("insert into profiles values ($1,'admin','active'),($2,'staff','active')",[actor,staff]);
 const save=async(period,version,settings=sample,id=randomUUID(),user=actor)=>(await db.query('select edu_save_recruitment_rooms($1,$2,$3,$4,$5) as value',[user,id,period,version,settings])).rows[0].value;
 const one=await save('first',0,sample,request);
 assert.equal(one.version,1);
 assert.deepEqual(await save('first',0,sample,request),one);
 await assert.rejects(save('second',0,sample,request),/CONVERSION_REQUEST_REUSED/);
 await assert.rejects(save('first',0),/CONVERSION_STALE/);
 await save('second',0,{...sample,paidMode:'reuse'});
 await save('first',1,{...sample,paidUrl:'https://open.kakao.com/o/changed',paidMode:'new'});
 const rows=(await db.query('select period_id,version,settings from edu_recruitment_room_revisions order by period_id,version')).rows;
 assert.equal(rows.length,3); assert.deepEqual(rows[0].settings,sample); assert.equal(rows[2].settings.paidUrl,sample.paidUrl);
 for(const bad of [{...sample,paidUrl:sample.organicUrl},{...sample,paidUrl:'https://evil.test/o/room'},{...sample,paidMode:null},{...sample,extra:'x'}]) await assert.rejects(save('invalid',0,bad),/CONVERSION_INVALID/);
 await assert.rejects(save('staff',0,sample,randomUUID(),staff),/CONVERSION_FORBIDDEN/);
 await db.query('insert into site_settings values ($1,$2)',[`edu_staff_permissions_${staff}`,{marketing:true,products:true}]);
 const staffRequest=randomUUID(); await save('staff',0,sample,staffRequest,staff);
 await db.query('update site_settings set value=$1',[{marketing:false,products:true}]);
 await assert.rejects(save('staff',0,sample,staffRequest,staff),/CONVERSION_FORBIDDEN/);
 for(const role of ['anon','authenticated','service_role']) {
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal((await db.query("select has_table_privilege($1,'public.edu_recruitment_room_revisions',$2) as ok",[role,privilege])).rows[0].ok,role==='service_role'&&privilege==='SELECT');
  assert.equal((await db.query("select has_function_privilege($1,'public.edu_save_recruitment_rooms(uuid,uuid,text,integer,jsonb)','EXECUTE') as ok",[role])).rows[0].ok,role==='service_role');
 }
 }finally{await db.close();}
});
