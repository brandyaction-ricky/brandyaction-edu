import test from 'node:test';
import assert from 'node:assert/strict';
import { questionContexts } from './helpers/question-learning-context.mjs';
const { questionLearningContexts, threadLearningContext } = questionContexts;
const weeks = [{id:'prep',course_id:'moon',week_number:0},{id:'w1',course_id:'moon',week_number:1},{id:'w2',course_id:'moon',week_number:2},{id:'other',course_id:'other',week_number:1},{id:'gone',course_id:'moon',week_number:3,archived_at:'2026-01-01'}];
const lessons = [{id:'p',week_id:'prep',day_number:2}, ...Array.from({length:5},(_,i)=>({id:'a'+i,week_id:'w1',day_number:i+1})),{id:'b',week_id:'w2',day_number:1},{id:'hidden',week_id:'w2',day_number:2,is_published:false},{id:'c',week_id:'w2',day_number:3},{id:'archived',week_id:'w2',day_number:2,archived_at:'2026-01-01'},{id:'x',week_id:'other',day_number:1},{id:'g',week_id:'gone',day_number:1}];
const question=(id,lesson_id,week=1)=>({id,lesson_id,learning_context:`AI 문샷 챌린지 · 5기 · ${week}주차 · 수업 제목`});
function database(tables, {errorTable, errorSelect}={}) {
 const reads=[];
 return {reads,from(table){
  const read={table,columns:'',filters:[],bounds:null};reads.push(read);
  const query={select(columns){read.columns=columns;return this;},in(key,values){read.filters.push([key,values]);return this;},eq(key,value){read.filters.push([key,[value]]);return this;},order(){return this;},range(from,to){read.bounds=[from,to];return this;},maybeSingle(){return this.then(r=>({...r,data:r.data?.[0]||null}));},then(resolve,reject){
   let rows=(tables[table]||[]).filter(row=>read.filters.every(([key,values])=>values.includes(row[key])));
   if(read.bounds)rows=rows.slice(read.bounds[0],read.bounds[1]+1);
   const error=table===errorTable&&(!errorSelect||read.columns===errorSelect)?Error('private query failure'):null;
   return Promise.resolve({data:rows,error}).then(resolve,reject);
  }};return query;
 }};
}
test('existing question snapshots gain cumulative learner days, independent prep days and stable cohort/title', async()=>{
 const qs=[question('regular','b',2),question('prep','p',0),question('later','c',2),question('other','x')],before=structuredClone(qs),db=database({curriculum_weeks:weeks,curriculum_lessons:lessons});
 const result=await questionLearningContexts(db,qs);
 assert.equal(result.get('regular'),'AI 문샷 챌린지 · 5기 · 2주차 · 6일차 · 수업 제목');
 assert.equal(result.get('prep'),'AI 문샷 챌린지 · 5기 · 0주차 · 2일차 · 수업 제목');
 assert.equal(result.get('later'),'AI 문샷 챌린지 · 5기 · 2주차 · 8일차 · 수업 제목');
 assert.equal(result.get('other'),'AI 문샷 챌린지 · 5기 · 1주차 · 1일차 · 수업 제목');
 assert.deepEqual(qs,before);assert.equal(db.reads.length,4);
 for(const read of db.reads)assert.doesNotMatch(read.columns,/body|content|email|profiles|image/);
});
test('removed curriculum and unlinked/general questions retain historical context without fabricated day or broad queries',async()=>{
 const db=database({curriculum_weeks:weeks,curriculum_lessons:lessons});
 assert.equal((await questionLearningContexts(db,[{id:'general',learning_context:'결제 문의'},question('no-link',null)])).size,0);assert.equal(db.reads.length,0);
 const labels=await questionLearningContexts(db,[question('gone','g',3),question('archived','archived',2),question('missing','missing')]);assert.equal(labels.size,0);
});
test('moved lesson updates week/day once, without duplicating an existing day marker',async()=>{
 const q={...question('moved','b'),learning_context:'문샷 · 5기 · 1주차 · 99일차 · AARRR 수업'};
 const labels=await questionLearningContexts(database({curriculum_weeks:weeks,curriculum_lessons:lessons}),[q]);
 assert.equal(labels.get('moved'),'문샷 · 5기 · 2주차 · 6일차 · AARRR 수업');
});
test('a page of 100 questions shares one metadata read chain, not 100 curriculum loads',async()=>{
 const db=database({curriculum_weeks:weeks,curriculum_lessons:lessons});
 const labels=await questionLearningContexts(db,Array.from({length:100},(_,i)=>question('q'+i,'b',2)));
 assert.equal(labels.size,100);assert.equal(db.reads.length,4);
 assert.deepEqual(db.reads[2].filters,[['course_id',['moon']]]);
});
test('metadata pagination counts beyond the default 1000 rows and ignores other courses',async()=>{
 const many=Array.from({length:1005},(_,i)=>({id:'l'+String(i).padStart(4,'0'),week_id:'w1',day_number:i+1}));
 const db=database({curriculum_weeks:weeks,curriculum_lessons:[...many,{id:'b',week_id:'w2',day_number:1}]});
 const result=await questionLearningContexts(db,[question('q','b',2)]);
 assert.match(result.get('q'),/2주차 · 1006일차/);assert.equal(db.reads.length,5);
});
test('authorized thread enrichment preserves answers and never returns lesson metadata or extra questions',async()=>{
 const q=question('q','b',2),db=database({edu_questions:[q,question('secret','x')],curriculum_weeks:weeks,curriculum_lessons:lessons});
 const data={question:{id:'q',learningContext:q.learning_context,title:'질문'},answers:[{content:'기존 답변'}],canAnswer:false};
 const result=await threadLearningContext(db,data);
 assert.match(result.question.learningContext,/6일차/);assert.deepEqual(result.answers,data.answers);assert.equal(result.canAnswer,false);assert.equal(result.question.lesson_id,undefined);
 assert.deepEqual(db.reads[0].filters,[['id',['q']]]);assert.doesNotMatch(JSON.stringify(result),/secret|course_id|day_number/);
});
test('empty thread results do not trigger metadata reads and errors never produce a guessed day',async()=>{
 const db=database({});for(const data of [null,{ok:true},{question:{id:'q',learningContext:null}}])assert.equal(await threadLearningContext(db,data),data);assert.equal(db.reads.length,0);
 await assert.rejects(questionLearningContexts(database({}, {errorTable:'curriculum_lessons'}),[question('q','b',2)]),/private query failure/);
});
