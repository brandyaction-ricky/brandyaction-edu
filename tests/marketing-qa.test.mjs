import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const rules = {};
new Function('exports', ts.transpileModule(fs.readFileSync('lib/marketing-qa.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(rules);
test('KST schedules have the same instant regardless of device time zone and reject impossible dates', () => {
  for (const zone of ['UTC','America/Los_Angeles','Asia/Seoul']) {
    const before = process.env.TZ; process.env.TZ = zone;
    try { assert.equal(rules.kstToIso('2030-01-01T12:00'),'2030-01-01T03:00:00.000Z'); assert.equal(rules.kstInput('2030-01-01T03:00:00Z'),'2030-01-01T12:00'); }
    finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  }
  for (const value of ['2026-02-30T12:00','2026-10-12T24:30','','invalid']) assert.throws(()=>rules.kstToIso(value));
});
test('webinar catalog separates published zero-price free courses and paid cohorts', () => {
  const free={id:'free',title:'Free',category:'free',list_price:0,status:'published'},paid={id:'paid',title:'Paid',category:'paid_class',list_price:1000};
  assert.equal(rules.webinarFreeCourse(free),true);
  for (const row of [paid,{...free,list_price:1},{...free,status:'draft'},{...free,archived_at:'2026-01-01'}, {id:'unknown'}]) assert.equal(rules.webinarFreeCourse(row),false);
  assert.equal(rules.webinarPaidCohort({course_id:'paid',price:1000},[free,paid]),true);
  for (const row of [{course_id:'free',price:1000},{course_id:'paid',price:0},{course_id:'paid',price:1000,status:'cancelled'}]) assert.equal(rules.webinarPaidCohort(row,[free,paid]),false);
  assert.equal(rules.testCatalogName('[운영 QA 전용] 1,000원'),true);
  assert.equal(rules.testCatalogName('실제 1,000원 상품'),false);
});
test('duplicate warning includes broad scopes, ignores stopped/self/unrelated rules, never enables anything', () => {
  const rule={id:'a',is_active:true,trigger_type:'purchase_completed',trigger_course_id:'course'};
  const items=[rule,{...rule,id:'b',trigger_course_id:null},{...rule,id:'c',is_active:false},{...rule,id:'d',trigger_course_id:'another'},{...rule,id:'e',trigger_type:'member_joined'}];
  const before=JSON.stringify(items);
  assert.deepEqual(rules.overlappingAutomations(rule,items).map(x=>x.id),['b']);
  assert.deepEqual(rules.overlappingAutomations({...rule,is_active:false},items),[]);
  assert.equal(JSON.stringify(items),before);
});
