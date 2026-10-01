import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
function load(file) {
 const exports={};
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require',source)(exports,name=>load(path.resolve(path.dirname(file),name+'.ts')));
 return exports;
}
const {curriculumRows, visibilityPlan,curriculumFingerprint}=load(path.resolve('lib/curriculum-controls.ts'));
function fixture(){return {curriculum_weeks:[{id:'w0',course_id:'c',week_number:0,is_published:true},{id:'w1',course_id:'c',week_number:1,is_published:false},{id:'old',course_id:'c',archived_at:'deleted'},{id:'other',course_id:'other'}],curriculum_lessons:[{id:'a',week_id:'w0',is_published:true},{id:'b',week_id:'w1',is_published:true,is_preview:true,has_blocks:true},{id:'c',week_id:'w1',is_published:false,has_blocks:true},{id:'empty',week_id:'w1',is_published:false},{id:'old-l',week_id:'old',is_published:true}],lesson_contents:[]};}
test('opening a parent includes already-published children in impact preview, including free preview',()=>{
 const data=fixture(),plan=visibilityPlan(data,'c',{'weeks:w1':true});
 assert.deepEqual(plan.impacts.map(x=>[x.lesson.id,x.after,x.lesson.is_preview]),[['b',true,true]]);
 assert.equal(plan.changes.length,1);
 assert.equal(data.curriculum_weeks[1].is_published,false);
});
test('publication orders hides before child changes and opens parent last',()=>{
 const plan=visibilityPlan(fixture(),'c',{'weeks:w0':false,'learning:a':false,'learning:c':true,'weeks:w1':true});
 assert.deepEqual(plan.changes.map(x=>[x.row.id,x.value]),[['w0',false],['a',false],['c',true],['w1',true]]);
});
test('archived and cross-course rows never enter a publication plan; empty new publications are blocked',()=>{
 const data=fixture();assert.deepEqual(curriculumRows(data,'c').weeks.map(x=>x.id),['w0','w1']);
 const plan=visibilityPlan(data,'c',{'learning:empty':true,'weeks:other':true,'weeks:old':true,'learning:old-l':false});
 assert.equal(plan.changes.length,1);assert.equal(plan.invalid[0].id,'empty');
});
test('reconciliation derives only remaining writes after partial success',()=>{
 const data=fixture(),draft={'learning:c':true,'weeks:w1':true};data.curriculum_lessons[2].is_published=true;
 assert.deepEqual(visibilityPlan(data,'c',draft).changes.map(x=>x.row.id),['w1']);
});
test('freshness includes membership, preview permissions and updates',()=>{
 const data=fixture(),before=curriculumFingerprint(data,'c');
 data.curriculum_lessons[1].is_preview=false;assert.notEqual(curriculumFingerprint(data,'c'),before);
 const next=curriculumFingerprint(data,'c');data.curriculum_lessons.push({id:'new',week_id:'w1',is_published:true});assert.notEqual(curriculumFingerprint(data,'c'),next);
});
test('opening a parent cannot expose an empty previously-published child',()=>{
 const data=fixture();data.curriculum_lessons.find(row=>row.id==='empty').is_published=true;
 assert.deepEqual(visibilityPlan(data,'c',{'weeks:w1':true}).invalid.map(row=>row.id),['empty']);
});
test('cohort planning starts a new cohort hidden and changes only its own saved state',()=>{
 const data=fixture();data.curriculum_weeks[1].is_published=true;
 data.edu_cohort_week_visibility=[{cohort_id:'fourth',week_id:'w0',is_published:true},{cohort_id:'fourth',week_id:'w1',is_published:true}];
 data.edu_cohort_lesson_visibility=[{cohort_id:'fourth',lesson_id:'a',is_published:true},{cohort_id:'fourth',lesson_id:'b',is_published:true}];
 const fourth=visibilityPlan(data,'c',{},'fourth');
 const fifth=visibilityPlan(data,'c',{},'fifth');
 assert.equal(fourth.impacts.length,0);
 assert.equal(fifth.impacts.length,0);
 const plan=visibilityPlan(data,'c',{'weeks:w1':true,'learning:b':true},'fifth');
 assert.deepEqual(plan.changes.map(change=>change.row.id),['b','w1']);
 assert.deepEqual(plan.impacts.map(impact=>impact.lesson.id),['b']);
 assert.notEqual(curriculumFingerprint(data,'c','fourth'),curriculumFingerprint(data,'c','fifth'));
});
