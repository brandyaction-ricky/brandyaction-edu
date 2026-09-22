import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

function load(path, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL('../'+path, import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports = {};
  new Function('exports','require',code)(exports, name => {
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('@/lib/')) return load(name.replace('@/', '')+'.ts', dependencies);
    if (name.startsWith('./')) return load('lib/'+name.slice(2)+'.ts', dependencies);
    throw Error(name);
  });
  return exports;
}
const domain = load('features/mission/domain/form.ts');
const application = load('features/mission/application/submission.ts', {'@/features/mission/domain/form': domain});
const rules = {...domain, ...application};
const form = {version:1,questions:[{id:'q1',prompt:'실행 결과',kind:'text',required:true},{id:'q2',prompt:'참고 링크',kind:'link',required:false}],checklist:[{id:'c1',label:'직접 실행했습니다',required:true}]};
test('mission form validates bounds, stable IDs and unsafe links', () => {
  assert.deepEqual(rules.validateMissionForm(form),form);
  assert.deepEqual(rules.readMissionForm({}),rules.emptyMissionForm());
  for (const bad of [null,[],{...form,version:2},{...form,questions:Array(13).fill(form.questions[0])},{...form,checklist:[{...form.checklist[0],id:'q1'}]},{...form,questions:[{...form.questions[0],id:'__proto__'}]},{...form,questions:[{...form.questions[0],prompt:' '}]}]) assert.throws(()=>rules.validateMissionForm(bad));
  for (const url of ['javascript:alert(1)','data:text/html,test','https://user:password@example.test','/local','//evil.test']) assert.equal(rules.missionLink(url),false);
  assert.equal(rules.missionLink('https://example.test/result'),true);
});
test('incomplete drafts save, but submission requires answers and required checks; unknown keys are discarded', () => {
  assert.deepEqual(rules.missionFormResponse(form,{},[],true),{form_answers:{q1:'',q2:''},checklist:[]});
  assert.throws(()=>rules.missionFormResponse(form,{},['c1'],false),/필수 질문/);
  assert.throws(()=>rules.missionFormResponse(form,{q1:'test'},[],false),/필수 체크/);
  assert.throws(()=>rules.missionFormResponse(form,{q1:'test',q2:'javascript:alert(1)'},['c1'],false),/링크/);
  assert.throws(()=>rules.missionFormResponse(form,{q1:'a'.repeat(5001)},[],true),/5,000/);
  assert.throws(()=>rules.missionFormResponse(form,[],[],true));
  assert.deepEqual(rules.missionFormResponse(form,{q1:' result ',q2:'',admin:true},['c1','unknown'],false),{form_answers:{q1:'result',q2:''},checklist:['c1']});
});

const userId=randomUUID(),enrollmentId=randomUUID(),missionId=randomUUID(),lessonId=randomUUID(),courseId=randomUUID();
const mission={id:missionId,lesson_id:lessonId,title:'계획 세우기',instructions:'실행해 보세요',submission_type:'text',form_schema:form,updated_at:'2026-09-21T10:00:00Z',is_published:true};
function harness({user={id:userId,role:'student'},access=true,lessonExists=true,previous=null,stale=false,rpcError=null}={}) {
  const writes=[],reads=[];
  const db={from(table){
    const query={select(){return this},eq(key,value){reads.push({table,key,value});return this},order(){return this},limit(){return this},update(value){writes.push({table,kind:'update',value});return this},upsert(value){writes.push({table,kind:'upsert',value});return this},delete(){writes.push({table,kind:'delete'});return this},then(resolve){return Promise.resolve({data:null,error:null}).then(resolve)},async single(){return this.result()},async maybeSingle(){return this.result()},result(){return {data:table==='enrollments' ? access?{id:enrollmentId,user_id:userId,course_id:courseId,status:'active',access_starts_at:'2020-01-01',access_ends_at:null}:null : table==='curriculum_lessons'?lessonExists?{id:lessonId,curriculum_weeks:{course_id:courseId,is_published:true}}:null : table==='curriculum_missions'?stale?null:mission : table==='mission_submissions'?previous:null,error:null}}};return query;
  },async rpc(name,args){writes.push({name,args});return {data:{passed:true,draftRevision:missionId},error:rpcError||(stale&&name==='save_mission_definition'?{code:'P0001',message:'다른 작업에서 미션을 변경했습니다.'}:null)}}};
  const route=load('app/api/platform/route.ts',{
    '@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},
    '@/lib/edu-settings':{},'@/lib/crm-delivery':{},'@/lib/operator-permissions':{permissionsFor:async()=>({products:user?.role==='admin'}),sectionScopes:{missions:'products'}},
  });
  const send=(body={},origin='https://example.test')=>route.POST(new Request('https://example.test/api/platform',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'mission',enrollmentId,missionId,lessonId,missionVersion:mission.updated_at,draftRevision:null,formAnswers:{q1:'실행 내용'},checklist:['c1'],...body})}));
  return {send,writes,reads};
}
test('mission API denies anonymous, cross-origin, wrong enrollment, stale forms and locked attempts before writing', async () => {
  for (const [options,body,expected] of [[{user:null},{},401],[{access:false},{},403],[{lessonExists:false},{},403],[{}, {missionVersion:'old'},409],[{previous:{status:'submitted'}},{},409],[{previous:{status:'approved'}},{draft:true},409],[{}, {formAnswers:{}},400],[{}, {checklist:[]},400],[{}, {draft:'true'},400]]) {
    const h=harness(options), r=await h.send(body); assert.equal(r.status,expected,await r.text());assert.equal(h.writes.length,0);
  }
  const h=harness();assert.equal((await h.send({},'https://other.test')).status,403);assert.equal(h.writes.length,0);
});
test('mission API stores incomplete structured drafts and immutable submission snapshots', async () => {
  const h=harness();assert.equal((await h.send({draft:true,formAnswers:{q2:'https://unfinished'},checklist:[],url:'unfinished'})).status,200);
  assert.equal(h.writes[0].name,'save_mission_draft');assert.equal(h.writes[0].args.p_response.form_answers.q1,'');
  assert.equal(h.writes[0].args.p_expected,null);
  const submit=harness();const r=await submit.send({formAnswers:{q1:'내용',unknown:'ignored'},role:'admin'});assert.equal(r.status,200,await r.text());
  const rpc=submit.writes.find(w=>w.name==='submit_learning_mission');assert.equal(rpc.args.p_user,userId);assert.deepEqual(rpc.args.p_response.form_snapshot,form);assert.deepEqual(rpc.args.p_response.mission_snapshot,{title:mission.title,instructions:mission.instructions,submission_type:mission.submission_type});assert.equal(rpc.args.p_response.form_answers.unknown,undefined);
  assert.equal(submit.writes.some(w=>w.kind==='delete'),false); // cleanup is transactional in SQL
  const conflict=harness({rpcError:{message:'미션 구성이 변경되었습니다.'}});assert.equal((await conflict.send()).status,409);assert.equal(conflict.writes.some(w=>w.kind==='delete'),false);
});
test('mission editor API enforces product permission, validates schema and guards concurrent edits', async () => {
  const body={action:'save',section:'missions',id:missionId,expectedUpdatedAt:mission.updated_at,values:{title:mission.title,lesson_id:lessonId,instructions:'안내',is_published:true,is_required:true,submission_type:'text',form_schema:form}};
  assert.equal((await harness().send(body)).status,403);
  const h=harness({user:{id:userId,role:'admin'}});const r=await h.send(body);assert.equal(r.status,200,await r.text());assert.deepEqual(h.writes[0].args.p_values.form_schema,form);assert.equal(h.writes[0].args.p_expected,mission.updated_at);
  const stale=harness({user:{id:userId,role:'admin'},stale:true});assert.equal((await stale.send(body)).status,409);
  const invalid=harness({user:{id:userId,role:'admin'}});assert.equal((await invalid.send({...body,values:{...body.values,form_schema:{}}})).status,400);assert.equal(invalid.writes.length,0);
  const missing=harness({user:{id:userId,role:'admin'}});const {form_schema: ignored, ...withoutSchema}=body.values;void ignored;
  assert.equal((await missing.send({...body,values:withoutSchema})).status,409);assert.equal(missing.writes.length,0);
});

test('migration retains legacy rows, enforces snapshots and required answers, and never changes existing grants', async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table curriculum_missions(id uuid primary key,title text,instructions text,submission_type text,is_published boolean default true);
      create table edu_mission_drafts(id uuid primary key);
      create table mission_submissions(id uuid primary key default gen_random_uuid(),mission_id uuid,response jsonb,status text default 'submitted');
      grant select on mission_submissions to authenticated; grant all on curriculum_missions,edu_mission_drafts,mission_submissions to service_role;`);
    await db.query('insert into curriculum_missions(id,title,instructions,submission_type) values($1,$2,$3,$4)',[missionId,mission.title,mission.instructions,mission.submission_type]);
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260921144834_member_mission_workspace.sql',import.meta.url),'utf8'));
    const insert=response=>db.query('insert into mission_submissions(mission_id,response) values($1,$2) returning id',[missionId,response]);
    await insert({text:'legacy'});
    await db.query('update curriculum_missions set form_schema=$1 where id=$2',[form,missionId]);
    const response={form_snapshot:form,mission_snapshot:{title:mission.title,instructions:mission.instructions,submission_type:mission.submission_type},form_answers:{q1:'완료',q2:''},checklist:['c1']};
    const sid=(await insert(response)).rows[0].id;
    for (const bad of [{...response,form_snapshot:{}},{...response,mission_snapshot:{title:'stale'}},{...response,form_answers:{q1:' ',q2:''}},{...response,form_answers:{q1:7,q2:''}},{...response,checklist:[]}]) await assert.rejects(insert(bad));
    await assert.rejects(db.query('update mission_submissions set response=$1 where id=$2',[{text:'tampered'},sid]),/변경할 수 없습니다/);
    await db.query("update mission_submissions set status='changes_requested' where id=$1",[sid]);
    await insert(response); // a new attempt retains its own snapshot
    await db.query("update curriculum_missions set title='새 제목' where id=$1",[missionId]);
    await assert.rejects(insert(response),/변경되었습니다/);
    assert.equal((await db.query('select response from mission_submissions where id=$1',[sid])).rows[0].response.mission_snapshot.title,mission.title);
    await db.query('update curriculum_missions set is_published=false where id=$1',[missionId]);
    await assert.rejects(insert(response),/공개된 미션/);
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query("select has_function_privilege($1,'guard_mission_form_submission()','EXECUTE') as ok",[role])).rows[0].ok,false);
      assert.equal((await db.query("select has_table_privilege($1,'mission_submissions','INSERT') as ok",[role])).rows[0].ok,false);
    }
  } finally {await db.close();}
});
