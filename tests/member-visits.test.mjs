import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
function load(file,mocks={}){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,name=>{assert.ok(name in mocks,name);return mocks[name];});return exports;}
const rules=load('lib/member-visits.ts');
process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';
function harness({user={id:id(1),role:'student'},operator=true,error=null}={}){
 const calls=[];
 const deps={'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async scope=>{assert.equal(scope,'members');return operator;}},'@/lib/supabase/admin':{createAdminClient:()=>({rpc(name,args){calls.push({name,args});return {abortSignal:async()=>({data:{rows:[],total:0},error})};}})},'@/lib/member-visits':rules,'@/lib/edu-workflows':{uuid:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v)}};
 const write=load('app/api/platform/member-visit/route.ts',deps),read=load('app/api/admin/member-visits/route.ts',deps);
 return {calls,post:(body,origin='https://edu.test')=>write.POST(new Request('https://edu.test/api/platform/member-visit',{method:'POST',headers:origin?{origin}:{},...(body!==undefined?{body}:{} )})),get:(query='')=>read.GET(new Request('https://edu.test/api/admin/member-visits'+query))};
}
test('Korean day boundaries and real calendar validation',()=>{
 assert.equal(rules.koreanDay(Date.parse('2026-09-28T14:59:59Z')),'2026-09-28');assert.equal(rules.koreanDay(Date.parse('2026-09-28T15:00:00Z')),'2026-09-29');
 for(const value of ['2026-02-29','2026-13-01','2026-09-31','9/29/2026',null,'2026-09-29T00:00'])assert.equal(rules.visitDay(value),false);
 assert.equal(rules.visitDay('2028-02-29'),true);
});
test('recording uses authenticated identity only and forbids bodies, staff and foreign requests',async()=>{
 for(const [options,status] of [[{user:null},401],[{user:{id:id(1),role:'admin'}},403],[{user:{id:id(1),role:'staff'}},403]]){const h=harness(options);assert.equal((await h.post()).status,status);assert.equal(h.calls.length,0);}
 const h=harness();for(const origin of [null,'https://other.test'])assert.equal((await h.post(undefined,origin)).status,403);
 for(const body of ['{}',JSON.stringify({member:id(2),at:'2000-01-01'}),'x'.repeat(10000)])assert.equal((await h.post(body)).status,400);
 assert.equal(h.calls.length,0);const response=await h.post();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(h.calls,[{name:'edu_record_member_visit',args:{p_member:id(1)}}]);
});
test('feature gate prevents every read/write while off',async()=>{
 const h=harness();process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='false';try{assert.equal((await h.post()).status,404);assert.equal((await h.get()).status,404);assert.equal(h.calls.length,0);}finally{process.env.NEXT_PUBLIC_EDU_LESSON_BLOCKS_ENABLED='true';}
});
test('member read checks authorization and validates member, date, and page before RPC',async()=>{
 for(const [options,status] of [[{user:null},401],[{operator:false},403]]){const h=harness(options);assert.equal((await h.get()).status,status);assert.equal(h.calls.length,0);}
 const h=harness();for(const q of ['?member=bad','?member=','?page=0','?page=1.1','?page=100001','?day=2026-02-29',`?member=${id(1)}&day=2026-09-29`])assert.equal((await h.get(q)).status,400,q);
 assert.equal(h.calls.length,0);await h.get('?day=2026-09-29&page=2');await h.get('?member='+id(2));await h.get();
 assert.deepEqual(h.calls[0].args,{p_actor:id(1),p_member:null,p_day:'2026-09-29',p_page:2});assert.deepEqual(h.calls[1].args,{p_actor:id(1),p_member:id(2),p_day:null,p_page:1});assert.equal(h.calls[2].args.p_day,rules.koreanDay());
});
test('missing members and service failures remain retryable without exposing database details',async()=>{
 assert.equal((await harness({error:{message:'VISIT_NOT_FOUND'}}).get('?member='+id(2))).status,404);
 const h=harness({error:{message:'private SQL detail'}});for(const response of [await h.post(),await h.get()]){assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private SQL detail/);}
});
test('actual SQL access, first/last visit aggregation, throttling, per-day isolation and paged projections',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key,role text,status text,full_name text,phone text);create table site_settings(key text primary key,value jsonb);grant select on profiles,site_settings to service_role;');
  const reviewer=fs.readFileSync(new URL('../supabase/migrations/20260928161532_lesson_block_mentor_reviews.sql',import.meta.url),'utf8').match(/create function public.edu_assert_block_reviewer\(p_actor uuid\)[\s\S]*?\$\$;/)[0];
  await db.exec(reviewer);await db.exec('revoke all on function edu_assert_block_reviewer(uuid) from public;grant execute on function edu_assert_block_reviewer(uuid) to service_role;');
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260929012022_member_visits.sql',import.meta.url),'utf8'));
  await db.query("insert into profiles values($1,'admin','active','운영자',null),($2,'student','active','시험 회원','010-0000-0000'),($3,'student','withdrawn','탈퇴',null),($4,'staff','active','직원',null)",[id(1),id(2),id(3),id(4)]);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from edu_member_visits'),/permission denied/);await assert.rejects(db.query('select edu_record_member_visit($1)',[id(2)]),/permission denied/);await assert.rejects(db.query('select edu_admin_member_visits($1,null,current_date)',[id(1)]),/permission denied/);await db.exec('reset role');}
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='edu_member_visits'")).rows[0].relrowsecurity,true);
  await db.exec('set role service_role');for(const member of [id(1),id(3),id(4),id(99)])await assert.rejects(db.query('select edu_record_member_visit($1)',[member]),/VISIT_FORBIDDEN/);
  await db.query('select edu_record_member_visit($1)',[id(2)]);const first=(await db.query('select * from edu_member_visits')).rows[0];
  await db.query('select edu_record_member_visit($1)',[id(2)]);assert.deepEqual((await db.query('select * from edu_member_visits')).rows[0],first);
  const day=(await db.query("select (clock_timestamp() at time zone 'Asia/Seoul')::date::text as day")).rows[0].day;assert.equal(new Date(first.visit_day).toISOString().slice(0,10),day);
  // Force an earlier observation on the same day; refreshing preserves the first time.
  await db.query("update edu_member_visits set first_seen_at=($1::date::timestamp at time zone 'Asia/Seoul'),last_seen_at=($1::date::timestamp at time zone 'Asia/Seoul')",[day]);
  await db.query('select edu_record_member_visit($1)',[id(2)]);const refreshed=(await db.query('select * from edu_member_visits')).rows[0];assert.ok(Date.parse(refreshed.last_seen_at)>=Date.parse(refreshed.first_seen_at));
  await assert.rejects(db.query('update edu_member_visits set last_seen_at=first_seen_at-interval \'1 minute\''),/check constraint/);
  await assert.rejects(db.query('select edu_admin_member_visits($1,null,$2::date)',[id(2),day]),/BLOCK_FORBIDDEN/);
  await assert.rejects(db.query('select edu_admin_member_visits($1,null,$2::date)',[id(4),day]),/BLOCK_FORBIDDEN/);
  await db.exec('reset role');await db.query("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+id(4)]);await db.exec('set role service_role');
  await db.query("insert into edu_member_visits select $1,($2::date-n), (($2::date-n)::timestamp at time zone 'Asia/Seoul'),(($2::date-n)::timestamp at time zone 'Asia/Seoul') from generate_series(1,24) n",[id(2),day]);
  const read=async(actor,member,whichDay,page=1)=>(await db.query('select edu_admin_member_visits($1,$2,$3,$4) as result',[actor,member,whichDay,page])).rows[0].result;
  const history=await read(id(4),id(2),null,2);assert.equal(history.total,25);assert.equal(history.rows.length,5);assert.ok(history.rows.every(row=>row.member===id(2)));assert.ok(history.rows[0].day>history.rows[4].day);assert.equal(history.pageSize,20);
  const today=await read(id(1),null,day);assert.equal(today.total,1);assert.deepEqual(Object.keys(today.rows[0]).sort(),['day','firstSeen','lastSeen','member','name','phone']);
  await assert.rejects(read(id(1),id(3),null),/VISIT_NOT_FOUND/);await assert.rejects(read(id(1),null,null),/VISIT_INVALID/);await assert.rejects(read(id(1),id(2),day),/VISIT_INVALID/);
  await db.exec('reset role');await db.query("update profiles set status='withdrawn' where id=$1",[id(2)]);assert.equal((await read(id(1),null,day)).total,0);
  await db.query('delete from profiles where id=$1',[id(2)]);assert.equal((await db.query('select count(*)::int n from edu_member_visits')).rows[0].n,0);
 }finally{await db.close();}
});
