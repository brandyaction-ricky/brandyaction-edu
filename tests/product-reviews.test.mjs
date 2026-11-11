import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { loadTs } from './helpers/question-ai.mjs';
const { readPublishedProductReviews, readProductReviewContext } = loadTs('lib/product-reviews-server.ts');
const course = '11111111-1111-4111-8111-111111111111';
function database(fixtures = {}, failure = '') {
  const calls = [];
  return { calls, from(table) {
    const call = { table, filters: [], columns: '', start: 0, end: Infinity }; calls.push(call);
    const q = { select(columns) { call.columns = columns; return q; }, eq(k,v) { call.filters.push([k,v]); return q; }, is(k,v) { call.filters.push([k,v]); return q; }, order() { return q; }, range(start,end) { Object.assign(call,{start,end}); return q; }, maybeSingle() { call.single=true; return q; }, then(resolve) {
      const data = (fixtures[table] || []).filter(r => call.filters.every(([k,v]) => v === null ? r[k] == null : r[k] === v)).slice(call.start,call.end+1);
      return Promise.resolve({ data: call.single ? data[0] || null : data, error: failure === table ? Error('private-db-details') : null }).then(resolve);
    } }; return q;
  } };
}
test('public reviews paginate, aggregate beyond row cap, exclude pending/other courses and mask identity', async () => {
  const published = Array.from({length:1001},(_,i)=>({id:String(i),course_id:course,status:'published',rating:i===1000?1:5,body:'경험 '+i,author_name:'김실명',author_nickname:'별명',user_id:'private',order_id:'private',published_at:'2026-11-10T00:00:00Z'}));
  const db=database({courses:[{id:course,status:'published'}],reviews:[...published,{course_id:course,status:'pending',rating:1},{course_id:'other',status:'published',rating:1}]});
  const result=await readPublishedProductReviews(db,course,1);
  assert.equal(result.rows.length,10);assert.equal(result.summary.count,1001);assert.equal(result.summary.average,5001/1001);assert.equal(result.hasMore,true);
  assert.deepEqual(Object.keys(result.rows[0]).sort(),['author','body','id','published_at','rating']);assert.equal(result.rows[0].author,'별**');
  assert.doesNotMatch(JSON.stringify(result),/김실명|private|user_id|order_id/);
  assert.deepEqual(db.calls.filter(c=>c.columns==='rating').map(c=>[c.start,c.end]),[[0,999],[1000,1999]]);
  assert.equal((await readPublishedProductReviews(db,course,101)).hasMore,false);
});
test('unpublished/archived products do not reveal reviews and database failures do not become empty success', async () => {
  for(const row of [{id:course,status:'draft'},{id:course,status:'published',archived_at:'2026-11-01'}]) await assert.rejects(readPublishedProductReviews(database({courses:[row]}),course,1),e=>e.status===404);
  await assert.rejects(readPublishedProductReviews(database({courses:[{id:course,status:'published'}]},'reviews'),course,1));
  const empty=await readPublishedProductReviews(database({courses:[{id:course,status:'published'}]}),course,1);
  assert.deepEqual(empty.summary,{count:0,average:null});
});
test('composer context uses only own course enrollment, excludes expired/revoked access and returns existing pending review',async()=>{
  const db=database({enrollments:[{id:'foreign',user_id:'other',course_id:course,status:'active'},{id:'expired',user_id:'me',course_id:course,status:'active',access_ends_at:'2020-01-01'},{id:'revoked',user_id:'me',course_id:course,status:'active',revoked_at:'2026-01-01'},{id:'valid',user_id:'me',course_id:course,status:'active'}],reviews:[{id:'mine',user_id:'me',course_id:course,status:'pending',body:'작성한 후기'}]});
  const context=await readProductReviewContext(db,'me',course);assert.equal(context.enrollmentId,'valid');assert.equal(context.review.id,'mine');
  for(const call of db.calls){assert.ok(call.filters.some(([k,v])=>k==='user_id'&&v==='me'));assert.ok(call.filters.some(([k,v])=>k==='course_id'&&v===course));}
  assert.equal((await readProductReviewContext(database(), 'me', course)).enrollmentId,null);
});
test('review GET validates inputs, requires login for own context and never caches personalized responses',async()=>{
  let user=null,reads=0;
  const { GET }=loadTs('app/api/product-reviews/route.ts',{'@/lib/supabase/server':{createClient:async()=>({})},'@/lib/server-auth':{getAuthenticatedUser:async()=>user},'@/lib/product-reviews-server':{readProductReviewContext:async(_db,id)=>{reads++;return{id};},readPublishedProductReviews:async()=>({rows:[]})}});
  const get=query=>GET(new Request('https://edu.example/api/product-reviews?'+query));
  assert.equal((await get('course=bad')).status,400);
  for(const page of ['0','1.5','100001','NaN'])assert.equal((await get('course='+course+'&page='+page)).status,400);
  assert.equal((await get('course='+course+'&context=1')).status,401);assert.equal(reads,0);
  user={id:'me'};const response=await get('course='+course+'&context=1');assert.deepEqual(await response.json(),{id:'me'});assert.equal(response.headers.get('cache-control'),'private, no-store');
});
function writeHarness(enrollment={id:course,user_id:'me',course_id:course,cohort_id:'cohort',status:'active'}) {
  const writes=[],filters=[],invalidations=[];
  const db={from(table){const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async single(){return{data:enrollment,error:null};},async upsert(values,options){writes.push({table,values,options});return{error:null};}};return q;}};
  const output=ts.transpileModule(fs.readFileSync(new URL('../app/api/platform/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const out={},imports={'@/lib/server-auth':{getAuthenticatedUser:async()=>({id:'me',full_name:'실제 회원'})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/platform-rules':loadTs('lib/platform-rules.ts'),'@/lib/qa-rules':loadTs('lib/qa-rules.ts'),'next/cache':{revalidateTag:(...args)=>invalidations.push(args)},'@/lib/public-platform-plan':{PUBLIC_CACHE_TAG:'public'}};
  new Function('exports','require',output)(out,name=>imports[name]||{});
  return{writes,filters,invalidations,send:body=>out.POST(new Request('https://edu.example/api/platform',{method:'POST',headers:{origin:'https://edu.example','Content-Type':'application/json'},body:JSON.stringify({action:'review',enrollmentId:course,rating:4,content:' 유익한 수업 ',...body})}))};
}
test('review save derives owner/course from enrollment, uses one upsert, returns to moderation and invalidates public cache',async()=>{
  const h=writeHarness();assert.equal((await h.send({user_id:'forged',course_id:'forged',status:'published'})).status,200);
  assert.deepEqual(h.filters,[['id',course],['user_id','me'],['status','active']]);assert.equal(h.writes.length,1);
  assert.deepEqual(h.writes[0],{table:'reviews',values:{user_id:'me',course_id:course,cohort_id:'cohort',author_name:'실제 회원',rating:4,body:'유익한 수업',status:'pending'},options:{onConflict:'user_id,course_id'}});
  assert.deepEqual(h.invalidations,[['public',{expire:0}]]);
});
test('invalid rating/body and expired enrollment never write reviews',async()=>{
  for(const body of [{rating:0},{rating:6},{rating:1.5},{content:' '},{content:'a'.repeat(5001)}]){const h=writeHarness();assert.equal((await h.send(body)).status,400);assert.equal(h.writes.length,0);}
  const h=writeHarness({id:course,status:'active',access_ends_at:'2020-01-01'});assert.equal((await h.send({})).status,403);assert.equal(h.writes.length,0);
});
