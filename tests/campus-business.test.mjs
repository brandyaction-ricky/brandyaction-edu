import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
const load=async p=>{const r=await build({entryPoints:[p],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));};
const d=await load('features/campus/business/domain.ts');
const {handleBusiness}=await load('features/campus/business/handler.ts');
const {handleReviews}=await load('features/campus/business/review-handler.ts');
const {hashReviewToken,validateReviewDraft,publicReviewInput}=await load('features/campus/business/reviews.ts');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const baseMetric={...d.emptyPayload('metric'),stage:'시작점',start:'2026-10-01',end:'2026-10-07',actions:3,leads:2,revenue:10000,minutes:120};
const row=(n,payload)=>({id:id(n),kind:'metric',title:'자기 보고',payload,created_at:`2026-10-${String(n).padStart(2,'0')}T00:00:00Z`,archived_at:null});
test('strict typed records reject false verification flags, malformed numbers and dates',()=>{
 assert.deepEqual(d.validatePayload('metric',baseMetric),baseMetric);
 for(const patch of [{verified:true},{leads:-1},{leads:1.2},{revenue:NaN},{start:'2026-02-30'},{end:'2026-09-30'},{minutes:10081},{currency:'EUR'},{evidenceUrl:'javascript:alert(1)'},{evidenceUrl:'https://user:pass@example.com'}])assert.throws(()=>d.validatePayload('metric',{...baseMetric,...patch}));
 assert.throws(()=>d.validatePayload('experiment',{...d.emptyPayload('experiment'),hypothesis:'가설',action:'행동',measure:'문의수',start:'2026-11-01',end:'2026-11-03',status:'가설 지지'}));
 assert.throws(()=>d.validatePayload('brief',{...d.emptyPayload('brief'),product:'x',customer:'x',problem:'x',price:Infinity}));
});
test('comparison only uses matching nonoverlapping periods/currency and never imputes verified attribution',()=>{
 const a=row(8,baseMetric),b=row(15,{...baseMetric,stage:'체크인',start:'2026-10-08',end:'2026-10-14',actions:7,leads:0,revenue:5000,minutes:100});
 const result=d.comparison([a,b]);assert.equal(result.deltas.actions,4);assert.equal(result.deltas.leads,-2);assert.equal(result.deltas.minutes,-20);assert.match(result.reason,/교육으로 인한 효과나 검증된 성과를 뜻하지/);
 for(const patch of [{currency:'USD'},{start:'2026-10-07',end:'2026-10-13'},{end:'2026-10-15'}])assert.equal(d.comparison([a,{...b,payload:{...b.payload,...patch}}]).deltas,null);
 assert.equal(d.comparison([a]).deltas,null);
 const exported=d.exportBusiness([a,{...b,archived_at:'x'}]);assert.equal(JSON.parse(exported).records.length,1);assert.match(exported,/self-reported/);assert.ok(!exported.includes('user_id'));
});
test('resource suggestions are limited to actual current lessons; templates label deterministic material',()=>{
 const snapshot={lessons:[{id:'a',title:'고객 문제 찾기',day:1,href:'/a'},{id:'b',title:'광고 소재',day:4,href:'/b'}]};assert.deepEqual(d.findResources(snapshot,'고객').map(v=>v.id),['a']);assert.deepEqual(d.findResources(snapshot,'가상 수업'),[]);
 assert.equal(d.applyBrief('[상품]과 [고객]',{product:'상담',customer:'대표'}),'상담과 대표');assert.equal(d.rehearsalQuestions({customer:'대표',problem:'문의',product:'상담'}).length,3);
 for(const url of ['https://example.com/path','http://example.com'])assert.equal(d.safeUrl(url),true);
 for(const url of ['javascript:alert(1)','data:text/html,a','https://localhost','http://127.0.0.1','https://x.local','https://[::1]','https://name:secret@example.com'])assert.equal(d.safeUrl(url),false);
});
test('review capability validation is strict and raw token is not stored',()=>{
 const token='a'.repeat(43);assert.match(hashReviewToken(token),/^[a-f0-9]{64}$/);assert.notEqual(hashReviewToken(token),token);assert.throws(()=>hashReviewToken('short'));
 const draft={id:id(2),enrollmentId:id(3),consent:true,title:'시안',url:'https://example.com',question:'이해되나요?',days:3};assert.equal(validateReviewDraft(draft).days,3);
 for(const patch of [{consent:false},{days:8},{url:'file:///private'},{question:''},{id:'x'}])assert.throws(()=>validateReviewDraft({...draft,...patch}));
 assert.equal(publicReviewInput({action:'respond',token,requestId:id(10),clarity:4,answer:'충분함',consent:true}).answer,'충분함');
 for(const patch of [{clarity:6},{consent:false},{answer:' '},{requestId:'x'}])assert.throws(()=>publicReviewInput({action:'respond',token,requestId:id(10),clarity:4,answer:'충분함',consent:true,...patch}));
});
const deps={enabled:true,authenticate:async()=>({id:id(1)}),load:async()=>({records:[],nextCursor:null}),save:async()=>({id:id(20)})};
const request=(method='GET',headers={},body)=>new Request(`https://edu.test/api/campus/business?enrollmentId=${id(2)}`,{method,headers,body});
test('business API gates rollout, login, CSRF, body size and redacts unknown errors',async()=>{
 assert.equal((await handleBusiness(request(),{...deps,enabled:false})).status,404);assert.equal((await handleBusiness(request(),{...deps,authenticate:async()=>null})).status,401);
 for(const headers of [{},{origin:'https://evil.test'},{origin:'https://edu.test','sec-fetch-site':'cross-site'}])assert.equal((await handleBusiness(request('POST',headers,'{}'),deps)).status,403);
 for(const body of ['null','[]','bad','x'.repeat(40001)])assert.equal((await handleBusiness(request('POST',{origin:'https://edu.test','content-type':'application/json'},body),deps)).status,400);
 const ok=await handleBusiness(request(),deps);assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'private, no-store');
 const bad=await handleBusiness(request(),{...deps,load:async()=>{throw new Error('secret database content');}});assert.equal(bad.status,503);assert.ok(!(await bad.text()).includes('secret'));
});
test('public reviews remain feature-gated and same-origin; token errors do not leak details',async()=>{
 const publicDeps={...deps,create:async()=>({}),revoke:async()=>({}),publicRequest:async()=>({title:'테스트'})};
 assert.equal((await handleReviews(request(),publicDeps,true)).status,405);assert.equal((await handleReviews(request('POST',{},'{}'),publicDeps,true)).status,403);
 const make=()=>request('POST',{origin:'https://edu.test','content-type':'application/json'},'{}');assert.equal((await handleReviews(make(),{...publicDeps,enabled:false},true)).status,404);
 const r=await handleReviews(make(),publicDeps,true);assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});

test('Postgres: owner/enrollment isolation, strict payloads, CAS, archive; public token lifecycle and bounded anonymous replies',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,status text);create table courses(id uuid primary key,status text,archived_at timestamptz);create table cohorts(id uuid primary key,course_id uuid,archived_at timestamptz);
 create table enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);
 insert into profiles values('${id(1)}','active'),('${id(11)}','active');insert into courses values('${id(3)}','published',null);insert into cohorts(id,course_id) values('${id(4)}','${id(3)}');
 insert into enrollments(id,user_id,course_id,cohort_id,status) values('${id(2)}','${id(1)}','${id(3)}','${id(4)}','active'),('${id(12)}','${id(11)}','${id(3)}','${id(4)}','active');
 grant select on profiles,courses,cohorts,enrollments to authenticated,service_role;`);
 await db.exec(readFileSync('supabase/migrations/20261102151510_edu_campus_business_records.sql','utf8'));
 const login=async(uid=id(1))=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid}',false);`);
 await login();
 const insert=(payload=baseMetric,owner=id(1),enrollment=id(2),rid=id(20))=>db.query('insert into edu_campus_business_records(id,user_id,enrollment_id,kind,title,payload,last_command_id,creation_fingerprint) values($1,$2,$3,$4,$5,$6,$7,$8)',[rid,owner,enrollment,'metric','시작점',payload,id(30),'a'.repeat(64)]);
 await insert();assert.equal((await db.query('select * from edu_campus_business_records')).rows.length,1);
 await assert.rejects(insert({...baseMetric,verified:true},id(1),id(2),id(21)),/check constraint/i);
 await assert.rejects(insert(baseMetric,id(1),id(12),id(21)),/row-level security/i);
 await assert.rejects(insert(baseMetric,id(11),id(12),id(21)),/row-level security/i);
 await assert.rejects(db.query('update edu_campus_business_records set user_id=$1,revision=2,last_command_id=$2',[id(11),id(31)]),/immutable/i);
 await assert.rejects(db.query('update edu_campus_business_records set revision=3,last_command_id=$1',[id(31)]),/revision/i);
 await db.query('update edu_campus_business_records set title=$1,revision=2,last_command_id=$2 where revision=1',['수정',id(31)]);
 assert.equal((await db.query('update edu_campus_business_records set revision=2,last_command_id=$1 where revision=1 returning id',[id(32)])).rows.length,0);
 await login(id(11));assert.equal((await db.query('select * from edu_campus_business_records')).rows.length,0);assert.equal((await db.query('update edu_campus_business_records set title=$1 returning id',['남의 기록'])).rows.length,0);
 await login();await db.query('update edu_campus_business_records set archived_at=now(),revision=3,last_command_id=$1',[id(32)]);await assert.rejects(db.query('update edu_campus_business_records set archived_at=null,revision=4,last_command_id=$1',[id(33)]),/immutable/i);await assert.rejects(db.exec('delete from edu_campus_business_records'),/permission denied/i);
 const hash='a'.repeat(64);const createLink=(linkId=id(50),tokenHash=hash,owner=id(1),enrollment=id(2))=>db.query("insert into edu_campus_business_review_links(id,user_id,enrollment_id,token_hash,title,artifact_url,question,public_consent,expires_at) values($1,$2,$3,$4,'공개 제목','https://example.com','공개 질문',true,now()+interval '1 day')",[linkId,owner,enrollment,tokenHash]);
 await createLink();await assert.rejects(createLink(id(51),'b'.repeat(64),id(1),id(12)),/row-level security/i);
 await assert.rejects(db.exec('update edu_campus_business_review_links set response_count=5'),/permission denied/i);
 await assert.rejects(db.query('select edu_campus_business_review_read($1)',[hash]),/permission denied/i);
 await db.exec('reset role;set role anon;');await assert.rejects(db.exec('select * from edu_campus_business_review_links'),/permission denied/i);await assert.rejects(db.query('select edu_campus_business_review_read($1)',[hash]),/permission denied/i);
 await db.exec('reset role;set role service_role;');
 const read=async(h=hash)=>(await db.query('select edu_campus_business_review_read($1) as value',[h])).rows[0].value;
 const info=await read();assert.deepEqual(Object.keys(info).sort(),['accepting','expiresAt','question','title','url'].sort());assert.ok(!JSON.stringify(info).includes(id(1)));
 await assert.rejects(read('missing'),/Unavailable/i);
 await db.exec('reset role;update cohorts set archived_at=now();');await login();
 assert.equal((await db.query('select * from edu_campus_business_records')).rows.length,0);
 await assert.rejects(insert(baseMetric,id(1),id(2),id(90)),/row-level security/i);
 await assert.rejects(createLink(id(91),'f'.repeat(64)),/row-level security/i);
 await db.exec('reset role;set role service_role;');await assert.rejects(read(),/Unavailable/i);
 await assert.rejects(db.query('select edu_campus_business_review_respond($1,$2,4,$3)',[hash,id(92),'보관 후 응답']),/Unavailable/i);
 await db.exec('reset role;update cohorts set archived_at=null;set role service_role;');

 const reply=(rid=id(60),answer='가격 안내가 잘 보여요')=>db.query('select edu_campus_business_review_respond($1,$2,4,$3) as value',[hash,rid,answer]);
 assert.deepEqual((await reply()).rows[0].value,{accepted:true});await reply();assert.equal((await db.query('select response_count from edu_campus_business_review_links')).rows[0].response_count,1);
 await assert.rejects(reply(id(60),'다른 내용'),/conflict/i);await assert.rejects(reply(id(61)),/limit/i);
 await login(id(11));assert.equal((await db.query('select * from edu_campus_business_review_replies')).rows.length,0);
 await login();assert.equal((await db.query('select * from edu_campus_business_review_replies')).rows.length,1);await assert.rejects(db.query("insert into edu_campus_business_review_replies values(gen_random_uuid(),$1,4,'위조',now())",[id(50)]),/permission denied/i);
 await db.exec('reset role;set role service_role;');await db.exec("update edu_campus_business_review_links set response_count=50,last_response_at=now()-interval '10 seconds'");assert.equal((await read()).accepting,false);await assert.rejects(reply(id(62)),/limit/i);
 await login();await db.exec('update edu_campus_business_review_links set revoked_at=now(),revision=2');await db.exec('reset role;set role service_role;');await assert.rejects(read(),/Unavailable/i);await assert.rejects(reply(id(60)),/Unavailable/i);
 await login();await createLink(id(52),'c'.repeat(64));await db.exec("reset role;update enrollments set status='refunded' where id='"+id(2)+"';set role service_role;");await assert.rejects(read('c'.repeat(64)),/Unavailable/i);
 await login();assert.equal((await db.query('select * from edu_campus_business_records')).rows.length,0);await assert.rejects(insert(baseMetric,id(1),id(2),id(22)),/row-level security/i);
 await db.exec("reset role;delete from profiles where id='"+id(1)+"'");assert.equal((await db.query('select * from edu_campus_business_records')).rows.length,0);assert.equal((await db.query('select * from edu_campus_business_review_replies')).rows.length,0);
 }finally{await db.close();}
});

const {loadBusiness,saveBusiness}=await load('features/campus/business/repository.ts');
function fixture(){return {profiles:[{id:id(1),status:'active'}],enrollments:[{id:id(2),user_id:id(1),course_id:id(3),cohort_id:id(4),status:'active'}],courses:[{id:id(3),status:'published',archived_at:null}],cohorts:[{id:id(4),course_id:id(3)}],edu_campus_business_records:[]};}
function mockDatabase(data=fixture(),loseCas=false){return {data,from(table){let mode='select',values,columns='*',take=1000;const filters=[];const q={select(c){columns=c;return q;},eq(k,v){filters.push(r=>(r[k]??null)===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},gt(k,v){filters.push(r=>r[k]>v);return q;},order(){return q;},limit(n){take=n;return q;},insert(v){mode='insert';values=v;return q;},update(v){mode='update';values=v;return q;},async execute(single=false){if(mode==='insert'){if(data[table].some(r=>r.id===values.id))return {data:null,error:{code:'23505'}};data[table].push(structuredClone(values));return {data:structuredClone(values),error:null};}const rows=data[table].filter(r=>filters.every(f=>f(r))).slice(0,take);if(mode==='update'){if(loseCas)return {data:null,error:null};rows.forEach(r=>Object.assign(r,values));}const selected=rows.map(r=>columns==='*'?r:Object.fromEntries(columns.split(',').map(k=>[k,r[k]])));return {data:single?selected[0]||null:selected,error:null};},maybeSingle(){return q.execute(true);},then(resolve,reject){return q.execute().then(resolve,reject);}};return q;}};}
test('repository saves, reopens, retries without duplicate creation, preserves edits, rejects foreign scope and stale CAS',async()=>{
 const db=mockDatabase(),command={action:'create',id:id(70),requestId:id(71),enrollmentId:id(2),kind:'metric',title:'시작점',payload:baseMetric};
 const saved=await saveBusiness(db,id(1),command);assert.equal(saved.revision,1);assert.equal((await loadBusiness(db,id(1),id(2))).records.length,1);
 await saveBusiness(db,id(1),command);assert.equal(db.data.edu_campus_business_records.length,1);await assert.rejects(saveBusiness(db,id(1),{...command,title:'다른 내용'}),{status:409});
 const update={...command,action:'update',requestId:id(72),expectedRevision:1,title:'수정한 시작점'};assert.equal((await saveBusiness(db,id(1),update)).revision,2);assert.equal((await saveBusiness(db,id(1),update)).revision,2);
 assert.equal((await saveBusiness(db,id(1),command)).title,'수정한 시작점');
 await assert.rejects(saveBusiness(db,id(1),{...update,requestId:id(73)}),{status:409});await assert.rejects(saveBusiness(mockDatabase(db.data,true),id(1),{...update,requestId:id(74),expectedRevision:2}),{status:409});
 await assert.rejects(loadBusiness(db,id(11),id(2)),{status:403});await assert.rejects(saveBusiness(db,id(11),command),{status:403});
 const archive={action:'archive',id:id(70),requestId:id(75),enrollmentId:id(2),expectedRevision:2};await saveBusiness(db,id(1),archive);await saveBusiness(db,id(1),archive);assert.equal((await loadBusiness(db,id(1),id(2))).records.length,0);assert.equal(db.data.edu_campus_business_records[0].title,'수정한 시작점');
 await assert.rejects(saveBusiness(db,id(1),{...update,requestId:id(76),expectedRevision:3}),{status:409});
 db.data.cohorts[0].archived_at=new Date().toISOString();await assert.rejects(loadBusiness(db,id(1),id(2)),{status:403});await assert.rejects(saveBusiness(db,id(1),{...command,id:id(90)}),{status:403});db.data.cohorts[0].archived_at=null;
 db.data.enrollments[0].status='refunded';await assert.rejects(loadBusiness(db,id(1),id(2)),{status:403});
});

test('plain choice labels keep historical records valid and leave user text and export values intact',()=>{
 const old={...baseMetric,stage:'체크인'};
 assert.equal(d.validatePayload('metric',old).stage,'체크인');
 assert.equal(d.businessDisplayValue('metric','stage',old.stage),'최근 성과 기록');
 assert.equal(d.businessDisplayValue('brief','product','체크인'),'체크인');
 const record=row(15,old);
 assert.equal(JSON.parse(d.exportBusiness([record])).records[0].payload.stage,'체크인');
 assert.match(d.businessRecordText('metric',old),/기록 구분: 최근 성과 기록/);
 assert.match(d.businessRecordText('metric',{...old,note:'고객이 말한 가설 지지'}),/고객이 말한 가설 지지/);
});
