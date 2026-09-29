import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const id=n=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
function load(file,mocks={}){const exports={};new Function('exports','require',ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{assert.ok(name in mocks,name);return mocks[name];});return exports;}
const rules=load('lib/member-conversations.ts');
process.env.NEXT_PUBLIC_EDU_MESSAGES_ENABLED='true';process.env.NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED='true';
function harness({user={id:id(1)},allowed=true,error=null}={}){
 const calls=[];const route=load('app/api/admin/member-conversation/route.ts',{
  '@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/operator-permissions':{getOperatorUser:async(scope,actor)=>{assert.equal(scope,'members');assert.equal(actor,user);return allowed;}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc(name,args){calls.push({name,args});return{abortSignal:async()=>({data:{rows:[],nextCursor:null},error})};}})},
  '@/lib/edu-workflows':{uuid:value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value)},'@/lib/member-conversations':rules});
 return{calls,get:query=>route.GET(new Request('https://edu.test/api/admin/member-conversation'+(query??'?member='+id(2))))};
}
test('cursor retains microseconds and rejects malformed, extra-key and unbounded input',()=>{
 const cursor={at:'2026-09-29T01:00:00.123456+00:00',kind:'message',id:id(9)};
 assert.deepEqual(rules.parseConversationCursor(JSON.stringify(cursor)),cursor);assert.equal(rules.parseConversationCursor(null),null);
 for(const value of ['', 'null','[]','{}',JSON.stringify({...cursor,actor:id(1)}),JSON.stringify({...cursor,kind:'notice'}),JSON.stringify({...cursor,id:'bad'}),JSON.stringify({...cursor,at:'infinity'}),JSON.stringify({...cursor,at:'2026-13-01T00:00:00Z'}),'x'.repeat(181)])assert.throws(()=>rules.parseConversationCursor(value));
});
test('API gates, identity and input checks precede service access',async()=>{
 for(const [options,status]of[[{user:null},401],[{allowed:false},403]]){const h=harness(options);assert.equal((await h.get()).status,status);assert.equal(h.calls.length,0);}
 const h=harness();for(const query of ['', '?member=bad','?member='+id(2)+'&before=bad'])assert.equal((await h.get(query)).status,400);assert.equal(h.calls.length,0);
 for(const flag of ['NEXT_PUBLIC_EDU_MESSAGES_ENABLED','NEXT_PUBLIC_EDU_QUESTION_THREADS_ENABLED']){process.env[flag]='false';try{assert.equal((await h.get()).status,404);}finally{process.env[flag]='true';}}
 assert.equal(h.calls.length,0);const response=await h.get('?member='+id(2)+'&actor='+id(9));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');
 assert.deepEqual(h.calls,[{name:'edu_member_conversation',args:{p_actor:id(1),p_member:id(2),p_before:null}}]);
});
test('API hides database details and distinguishes missing member',async()=>{
 assert.equal((await harness({error:{message:'CONVERSATION_NOT_FOUND'}}).get()).status,404);
 const result=await harness({error:{message:'private SQL detail'}}).get();assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/private SQL/);
});
test('actual catch-all accepts the message inbox and rejects invalid child paths',async()=>{
 const platform=()=>null;const {default:Page}=load('app/[[...path]]/page.tsx',{'react/jsx-runtime':{jsx:(type,props)=>({type,props})},'@/app/ui/platform':{Platform:platform},'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');},redirect:()=>{}},'@/lib/landing-admin-state':{},'@/lib/platform':{sections:[]},'@/lib/edu-settings':{},'@/lib/supabase/server':{}});
 const result=await Page({params:Promise.resolve({path:['my','messages']}),searchParams:Promise.resolve({})});assert.equal(result.type,platform);assert.deepEqual(result.props.path,['my','messages']);
 for(const path of [['my','unknown'],['my','messages','x']])await assert.rejects(Page({params:Promise.resolve({path}),searchParams:Promise.resolve({})}),/NOT_FOUND/);
});
test('actual SQL enforces operator and participant boundaries, merges history without writing receipts, and pages tied timestamps',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
   create table profiles(id uuid primary key,role text,status text,full_name text);create table site_settings(key text primary key,value jsonb);
   create table edu_member_messages(id uuid primary key,sender_id uuid,recipient_id uuid,created_at timestamptz,content text,read_at timestamptz,is_notice boolean default false);
   create table edu_questions(id uuid primary key,user_id uuid,created_at timestamptz,title text,content text,is_archived boolean default false);
   create table edu_question_answers(id uuid primary key,question_id uuid,created_at timestamptz,content text,author_name text);
   grant select on all tables in schema public to service_role;`);
  await db.exec(read('supabase/migrations/20260928161532_lesson_block_mentor_reviews.sql').match(/create function public.edu_assert_block_reviewer\(p_actor uuid\)[\s\S]*?\$\$;/)[0]);
  await db.exec('revoke all on function edu_assert_block_reviewer(uuid) from public;grant execute on function edu_assert_block_reviewer(uuid) to service_role;');
  await db.exec(read('supabase/migrations/20260929013847_member_conversation_history.sql'));
  await db.query("insert into profiles values($1,'admin','active','관리자'),($2,'student','active','수강생'),($3,'staff','active','직원'),($4,'student','withdrawn','탈퇴'),($5,'admin','active','다른 운영자')",[id(1),id(2),id(3),id(4),id(5)]);
  const at='2026-09-29T01:00:00.123456Z';
  await db.query("insert into edu_member_messages(id,sender_id,recipient_id,created_at,content) select ('11111111-1111-4111-8111-'||lpad(n::text,12,'0'))::uuid,case when n%2=0 then $1::uuid else $2::uuid end,case when n%2=0 then $2::uuid else $1::uuid end,$3,'메시지 '||n from generate_series(100,130)n",[id(1),id(2),at]);
  await db.query("insert into edu_member_messages(id,sender_id,recipient_id,created_at,content,is_notice) values($1,$2,$3,$4,'다른 운영자 개인 대화',false),($5,null,$3,$4,'시스템 공지',true)",[id(8),id(5),id(2),at,id(9)]);
  await db.query("insert into edu_questions values($1,$2,$3,'보관된 질문','질문 원문',true),($4,$5,$3,'다른 회원 질문','보이면 안 됨',false)",[id(100),id(2),at,id(500),id(4)]);
  await db.query("insert into edu_question_answers values($1,$1,$2,'답변 원문','운영자 답변'),($3,$4,$2,'다른 회원 답변','비공개')",[id(100),at,id(501),id(500)]);
  const readRows=async(actor=id(1),member=id(2),cursor=null)=>(await db.query('select edu_member_conversation($1,$2,$3) result',[actor,member,cursor])).rows[0].result;
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(readRows(),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');for(const actor of [id(2),id(3),id(4),id(99)])await assert.rejects(readRows(actor),/BLOCK_FORBIDDEN/);
  for(const member of [id(4),id(99)])await assert.rejects(readRows(id(1),member),/CONVERSATION_NOT_FOUND/);
  for(const cursor of [{},[],{at:'infinity',kind:'message',id:id(1)},{at,kind:'wrong',id:id(1)},{at,kind:'message',id:'wrong'},{at,kind:'message',id:id(1),extra:true}])await assert.rejects(readRows(id(1),id(2),cursor),/CONVERSATION_INVALID/);
  const first=await readRows();assert.equal(first.rows.length,25);assert.equal(first.rows[0].kind,'question');assert.equal(first.rows[0].archived,true);assert.match(first.nextCursor.at,/123456/);
  // New arrivals must not shift or duplicate the older-page cursor.
  await db.exec('reset role');await db.query("insert into edu_member_messages(id,sender_id,recipient_id,created_at,content) values($1,$2,$3,'2026-09-29T02:00Z','新')",[id(999),id(1),id(2)]);await db.exec('set role service_role');
  const second=await readRows(id(1),id(2),first.nextCursor);assert.equal(second.rows.length,8);assert.equal(second.nextCursor,null);
  const rows=[...first.rows,...second.rows];assert.equal(new Set(rows.map(row=>row.kind+row.id)).size,33);assert.equal(rows.filter(row=>row.kind==='message').length,31);assert.equal(rows.at(-1).kind,'answer');assert.equal(rows.at(-1).content,'답변 원문');assert.ok(rows.every(row=>!row.content.includes('다른')&&!row.content.includes('시스템')));
  assert.equal((await db.query('select count(*)::int n from edu_member_messages where read_at is not null')).rows[0].n,0);
  await db.exec('reset role');await db.query("insert into site_settings values($1,'{\"members\":true}')",['edu_staff_permissions_'+id(3)]);await db.exec('set role service_role');
  const staff=await readRows(id(3));assert.deepEqual(staff.rows.map(row=>row.kind),['question','answer']);assert.equal(staff.nextCursor,null);
  await db.exec('reset role');await db.query("update profiles set status='withdrawn' where id=$1",[id(1)]);await assert.rejects(readRows(),/BLOCK_FORBIDDEN/);
 }finally{await db.close();}
});
