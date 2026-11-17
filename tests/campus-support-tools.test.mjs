import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function load(path){const r=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));}
const {parseIntake}=await load('features/campus/support/domain.ts');
const {parseToolDimension,toolGroupKey}=await load('features/campus/support/tool-dimensions.ts');
const {analyzeSupport,retrospectiveMarkdown}=await load('features/campus/support/analytics.ts');
const {saveSupport,loadSupport}=await load('features/campus/support/repository.ts');
const {handleSupport}=await load('features/campus/support/handler.ts');
const intake={kind:'intake',id:uid(60),enrollmentId:uid(31),lessonId:null,category:'tool',title:'가상 도구 오류',tried:'다시 시도',question:'예시 설정 확인',contextUrl:''};
test('legacy intake remains valid; named tools require a bounded coherent kind and no control characters',()=>{
 assert.deepEqual(parseToolDimension(),{tool_kind:'unspecified',tool_name:''});
 assert.equal(parseIntake(intake).tool_kind,'unspecified');
 assert.deepEqual(parseToolDimension('ai','  ｃｈａｔｇｐｔ  '),{tool_kind:'ai',tool_name:'ChatGPT'});
 assert.deepEqual(parseToolDimension('other','우리   도구'),{tool_kind:'other',tool_name:'우리 도구'});
 for(const args of [['fake','x'],['toString','x'],['ai',' '],['unspecified','ChatGPT'],['ai',null],['ai','x'.repeat(81)],['ai','bad\nname'],['ai','bad\u0000name']])assert.throws(()=>parseToolDimension(...args),{status:400});
 assert.equal(toolGroupKey({tool_kind:'ai',tool_name:' ChatGPT '}),toolGroupKey({tool_kind:'ai',tool_name:'ｃｈａｔｇｐｔ'}));
 assert.throws(()=>parseIntake({...intake,category:'constructor'}),{status:400});
});
test('tool grouping separates categories, combines normalized names across lessons and deduplicates learners without inferring question text',()=>{
 const now=Date.parse('2026-11-03T00:00:00Z'),day=86400000,r=(id,days,extra={})=>({id,user_id:'student',enrollment_id:'e',lesson_id:'l1',category:'tool',title:'support',question:'ChatGPT is in this body',created_at:new Date(now-days*day).toISOString(),updated_at:new Date(now).toISOString(),status:'open',...extra});
 const value=analyzeSupport({now,requests:[r('a',1,{tool_kind:'ai',tool_name:'ChatGPT'}),r('b',2,{tool_kind:'ai',tool_name:'chatgpt',lesson_id:'l2'}),r('c',9,{user_id:'past',tool_kind:'ai',tool_name:'ChatGPT'}),r('d',3,{user_id:'other',tool_kind:'other',tool_name:'ChatGPT'}),r('e',1),r('outside',15,{tool_kind:'ai',tool_name:'ChatGPT'})],actions:[],submissions:[],focus:[],missions:[],lessons:[{id:'l1',title:'첫 수업'},{id:'l2',title:'둘째 수업'}],sessions:[],bookings:[]});
 assert.equal(value.toolObstacles.length,3);const ai=value.toolObstacles.find(v=>v.kind==='ai');assert.equal(ai.current,2);assert.equal(ai.previous,1);assert.equal(ai.learners,1);assert.deepEqual(ai.lessons,['첫 수업','둘째 수업']);assert.equal(value.toolObstacles.find(v=>v.kind==='unspecified').current,1);assert.equal(value.currentRequests,4);
 const md=retrospectiveMarkdown(value);assert.match(md,/## 도구별 막힘/);assert.match(md,/AI \/ ChatGPT: 이번 2건, 이전 1건, 이번 요청자 1명/);assert.doesNotMatch(md,/student|ChatGPT is in this body/);
});
function mock(){const data={enrollments:[{id:uid(31),user_id:uid(1),course_id:uid(10),cohort_id:uid(20),status:'active',revoked_at:null,access_starts_at:null,access_ends_at:null}],courses:[{id:uid(10),status:'published',archived_at:null}],cohorts:[{id:uid(20),course_id:uid(10),archived_at:null}],edu_campus_support_requests:[],edu_campus_support_actions:[],edu_campus_preferences:[],edu_campus_office_sessions:[],edu_campus_office_bookings:[]};return {data,from(table){let insert=null,limit=1000;const filters=[];const q={select(){return q;},eq(k,v){filters.push(r=>(r[k]??null)===v);return q;},is(k,v){return q.eq(k,v);},neq(k,v){filters.push(r=>r[k]!==v);return q;},in(k,vs){filters.push(r=>vs.includes(r[k]));return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},order(){return q;},limit(v){limit=v;return q;},insert(v){insert=v;return q;},async run(single=false){if(insert){data[table].push({...insert,status:'open',revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});return {data:null,error:null};}const rows=data[table].filter(r=>filters.every(f=>f(r)));return {data:single?rows[0]||null:rows.slice(0,limit),count:rows.length,error:null};},maybeSingle(){return q.run(true);},then(ok,no){return q.run().then(ok,no);}};return q;}};}
test('real support handler/repository stores and reopens structured fields, keeps retries idempotent, and rejects mutated retries/foreign actors',async()=>{
 const db=mock(),command={...intake,toolKind:'advertising',toolName:' Meta 광고 관리자 '};const deps={enabled:true,authenticate:async()=>({id:uid(1)}),read:actor=>loadSupport(db,actor.id,uid(31)),write:(actor,c)=>saveSupport(db,()=>db,actor.id,c)};
 const post=body=>new Request('https://edu.test/api/campus/support',{method:'POST',headers:{origin:'https://edu.test','content-type':'application/json'},body:JSON.stringify(body)});
 const res=await handleSupport(post(command),deps);assert.equal(res.status,200);const saved=(await res.json()).requests[0];assert.equal(saved.tool_kind,'advertising');assert.equal(saved.tool_name,'Meta 광고 관리자');
 assert.equal((await handleSupport(post(command),deps)).status,200);assert.equal(db.data.edu_campus_support_requests.length,1);
 assert.equal((await handleSupport(post({...command,toolName:'Google Ads'}),deps)).status,409);
 assert.equal((await handleSupport(post({...command,id:uid(61),toolKind:'wrong'}),deps)).status,400);
 assert.equal((await handleSupport(post(command),{...deps,authenticate:async()=>({id:uid(2)})})).status,403);
 assert.equal(db.data.edu_campus_support_requests.length,1);
 const reopened=await handleSupport(new Request('https://edu.test/api/campus/support?scope='+uid(31)),deps);assert.equal((await reopened.json()).requests[0].tool_name,'Meta 광고 관리자');
});
test('old records without tool fields and old retry payload remain compatible',async()=>{const db=mock();db.data.edu_campus_support_requests.push({...parseIntake(intake),user_id:uid(1)});delete db.data.edu_campus_support_requests[0].tool_kind;delete db.data.edu_campus_support_requests[0].tool_name;await saveSupport(db,()=>db,uid(1),intake);assert.equal(db.data.edu_campus_support_requests.length,1);});
const migration=readFileSync('supabase/migrations/20261103012413_edu_campus_support_tool_dimensions.sql','utf8');
async function database(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
create table profiles(id uuid primary key,status text,role text);create table courses(id uuid primary key,status text,archived_at timestamptz);create table cohorts(id uuid primary key,course_id uuid,archived_at timestamptz);create table enrollments(id uuid primary key,user_id uuid,course_id uuid,cohort_id uuid,status text,revoked_at timestamptz,access_starts_at timestamptz,access_ends_at timestamptz);create table curriculum_weeks(id uuid primary key,course_id uuid,is_published boolean);create table curriculum_lessons(id uuid primary key,week_id uuid,is_published boolean,updated_at timestamptz);create table curriculum_missions(id uuid primary key,lesson_id uuid);
insert into profiles values('${uid(1)}','active','student'),('${uid(2)}','active','student');insert into courses values('${uid(10)}','published',null);insert into cohorts values('${uid(20)}','${uid(10)}',null);insert into enrollments(id,user_id,course_id,cohort_id,status) values('${uid(31)}','${uid(1)}','${uid(10)}','${uid(20)}','active'),('${uid(32)}','${uid(2)}','${uid(10)}','${uid(20)}','active');grant select on profiles,courses,cohorts,enrollments,curriculum_weeks,curriculum_lessons to authenticated,service_role;`);await db.exec(readFileSync('supabase/migrations/20261102152007_edu_campus_support_workspace.sql','utf8'));return db;}
test('additive SQL preserves existing requests and permissions while validating tool fields and blocking cross-owner/read-update abuse',async()=>{
 const db=await database();try{await db.query("insert into edu_campus_support_requests(id,user_id,enrollment_id,category,title,question) values($1,$2,$3,'tool','Legacy','Question')",[uid(60),uid(1),uid(31)]);
 const before=(await db.query("select polname,pg_get_expr(polqual,polrelid) as using,pg_get_expr(polwithcheck,polrelid) as check from pg_policy where polrelid='edu_campus_support_requests'::regclass order by polname")).rows;await db.exec(migration);assert.deepEqual((await db.query("select polname,pg_get_expr(polqual,polrelid) as using,pg_get_expr(polwithcheck,polrelid) as check from pg_policy where polrelid='edu_campus_support_requests'::regclass order by polname")).rows,before);
 assert.deepEqual((await db.query('select title,tool_kind,tool_name from edu_campus_support_requests')).rows,[{title:'Legacy',tool_kind:'unspecified',tool_name:''}]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${uid(1)}',false)`);
 const insert=(id,kind,name,owner=uid(1),enrollment=uid(31))=>db.query("insert into edu_campus_support_requests(id,user_id,enrollment_id,category,title,question,tool_kind,tool_name) values($1,$2,$3,'tool','Structured','Question',$4,$5)",[uid(id),owner,enrollment,kind,name]);
 await insert(61,'ai','ChatGPT');assert.equal((await db.query('select * from edu_campus_support_requests')).rows.length,2);
 for(const [k,n]of [['invalid','X'],['ai',''],['unspecified','ChatGPT'],['ai','x'.repeat(81)],['other','bad\nname']])await assert.rejects(insert(62,k,n),/check constraint/);
 await assert.rejects(insert(62,'ai','ChatGPT',uid(2),uid(32)),/row-level security/);await assert.rejects(db.exec("update edu_campus_support_requests set tool_name='forged'"),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(2)}',false)`);assert.equal((await db.query('select * from edu_campus_support_requests')).rows.length,0);
 }finally{await db.close();}
});
test('schema rollback refuses to destroy selected tool evidence and safely preserves legacy requests when columns are unused',async()=>{
 const db=await database(),rollback=readFileSync('integration/campus/support-tools/rollback.sql','utf8');try{await db.exec(migration);await db.query("insert into edu_campus_support_requests(id,user_id,enrollment_id,category,title,question,tool_kind,tool_name) values($1,$2,$3,'tool','Keep','Question','ai','ChatGPT')",[uid(60),uid(1),uid(31)]);await assert.rejects(db.exec(rollback),/Preserve support tool evidence/);await db.exec('rollback');assert.equal((await db.query('select tool_name from edu_campus_support_requests')).rows[0].tool_name,'ChatGPT');}finally{await db.close();}
 const legacy=await database();try{await legacy.query("insert into edu_campus_support_requests(id,user_id,enrollment_id,category,title,question) values($1,$2,$3,'tool','Legacy preserved','Question')",[uid(60),uid(1),uid(31)]);await legacy.exec(migration);await legacy.exec(rollback);assert.equal((await legacy.query('select title from edu_campus_support_requests')).rows[0].title,'Legacy preserved');assert.equal((await legacy.query("select count(*)::int n from information_schema.columns where table_name='edu_campus_support_requests' and column_name in('tool_kind','tool_name')")).rows[0].n,0);}finally{await legacy.close();}
});
