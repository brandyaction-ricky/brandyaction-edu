import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
async function module(path){const b=await build({entryPoints:[path],bundle:true,platform:'node',format:'esm',write:false});return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));}
const welcome=await module('features/campus/welcome/content.ts'),content=await module('features/campus/content/model.ts'),assessment=await module('features/campus/welcome/assessment.ts'),progress=await module('features/campus/welcome/progress.ts');
test('the supplied fifth cohort preset keeps all 4 content sections and does not mutate other cohorts',()=>{
 const before=JSON.stringify(welcome.DEFAULT_WELCOME),five=welcome.validateWelcome(welcome.cohortFiveWelcome());
 assert.equal(five.notices.length,1);assert.equal(five.lessons.length,8);assert.equal(five.assessment.quiz.length,10);assert.equal(five.assessment.level.length,8);assert.equal(five.autoWelcome,true);assert.match(five.notices[0].body,/11월 9일/);assert.equal(JSON.stringify(welcome.DEFAULT_WELCOME),before);
 assert.equal(assessment.startingPoint([0,0,0,0,0,0,0,0]).title,'처음부터 함께 시작해요');assert.equal(assessment.startingPoint([1,1,1,1,1,1,1,1]).score,8);assert.equal(assessment.startingPoint([2,2,2,2,2,2,2,2]).title,'내 일에 적용할 준비를 해요');
});
test('room content filters inner articles by role and publication while preserving public introductions',()=>{
 const article={id:'one',title:'Notice',body:'private course article',published:true,pinned:false,url:'',linkLabel:''};
 const source=content.validateCampusContent(Object.fromEntries(['live','library','welcome','study','office'].map(id=>[id,{...content.defaultRoom(id),articles:[article,{...article,id:'hidden',published:false}]}])));
 for(const role of ['guest','waiting','student']){const result=content.visibleCampusContent(source,role);assert.equal(result.library.articles.length,1);assert.equal(result.welcome.articles.length,role==='guest'?0:1);assert.equal(result.study.articles.length,role==='student'?1:0);assert.equal(result.office.articles.length,role==='student'?1:0);assert.ok(result.study.title);}
});
test('room editor rejects unknown tasks, unsafe images, malformed rich content and oversized content',()=>{
 const base=content.defaultRoom('welcome');
 for(const value of [{...base,tasks:[{id:'learning',title:'x',description:'',visible:true}]},{...base,image:'javascript:alert(1)'},{...base,body:'edu-lesson:v1\n{"type":"script"}'},{...base,title:'x'.repeat(81)}])assert.throws(()=>content.validateCampusContent({welcome:value}));
 const clean=welcome.articleBody('edu-lesson:v1\n'+JSON.stringify({type:'doc',content:[{type:'paragraph',attrs:{onclick:'alert(1)'},content:[{type:'text',text:'safe',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]}));assert.doesNotMatch(clean,/javascript|onclick/);
});
test('account progress merges independent writes without resetting avatar or once-only notice',()=>{
 let state=progress.mergeWelcomeState(null,{kind:'avatar',avatar:{nickname:'내 직원들'}},'v1');assert.equal(state.noticeSeen,false);
 state=progress.mergeWelcomeState(state,{kind:'notice'},'v2');state=progress.mergeWelcomeState(state,{kind:'progress',assessmentKey:'abc',progress:{video:false,quiz:[true,false],level:[0,2]}},'v3');assert.equal(state.noticeSeen,true);assert.equal(state.avatar.nickname,'내 직원들');assert.deepEqual(state.progress.level,[0,2]);assert.throws(()=>progress.cleanProgress({video:false,quiz:[],level:[9]}));assert.notEqual(progress.assessmentKey({quiz:[1]}),progress.assessmentKey({quiz:[2]}));
});
