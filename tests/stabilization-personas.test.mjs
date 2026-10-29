import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('../lib/platform-rules.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const {isPurchasableOffer, isRecruiting, hasLearningAccess} = exports;
const epoch = Date.parse('2026-10-29T00:00:00Z');
const at = offset => new Date(epoch + offset).toISOString();
// 5 account situations × 10 offers × 10 access states × 10 boundary times.
// Synthetic policy scenarios, not real people, browser sessions or conversion evidence.
const people = ['visitor', 'new-member', 'learner', 'graduate', 'administrator'];
const times = [-86400000, -1000, -1, 0, 1, 1000, 3599999, 3600000, 3600001, 86400000];
const paid = {id:'course',status:'published',category:'paid_class'};
const open = {id:'cohort',course_id:'course',status:'recruiting',recruitment_start_at:at(0),recruitment_end_at:at(3600000)};
const offers = [
  {name:'open-window',course:paid,cohort:open,buy:[false,false,false,true,true,true,true,false,false,false],recruit:[false,false,false,true,true,true,true,false,false,false]},
  {name:'closed',course:paid,cohort:{...open,status:'closed'}},
  {name:'draft',course:{...paid,status:'draft'},cohort:open,recruit:[false,false,false,true,true,true,true,false,false,false]},
  {name:'free',course:{...paid,category:'free'},cohort:open,recruit:[false,false,false,true,true,true,true,false,false,false]},
  {name:'presale',course:paid,cohort:{...open,status:'upcoming'},buy:[true,true,true,true,true,true,true,false,false,false],recruit:[false,false,false,true,true,true,true,false,false,false]},
  {name:'unpublished-schedule',course:paid,cohort:{...open,status:'upcoming',recruitment_start_at:null,recruitment_end_at:null}},
  {name:'archived-cohort',course:paid,cohort:{...open,archived_at:at(-1)}},
  {name:'archived-product',course:{...paid,archived_at:at(-1)},cohort:open,recruit:[false,false,false,true,true,true,true,false,false,false]},
  {name:'invalid-end',course:paid,cohort:{...open,recruitment_end_at:'invalid'}},
  {name:'operation-ended',course:paid,cohort:{...open,operation_end_at:at(0)}},
];
const access = [
  {name:'active',row:{status:'active'},allow:Array(10).fill(true)},
  {name:'window',row:{status:'active',access_starts_at:at(0),access_ends_at:at(3600000)},allow:[false,false,false,true,true,true,true,false,false,false]},
  {name:'revoked',row:{status:'active',revoked_at:at(-1)}},
  {name:'pending',row:{status:'pending'}},
  {name:'cancelled',row:{status:'cancelled'}},
  {name:'refunded',row:{status:'refunded'}},
  {name:'invalid-start',row:{status:'active',access_starts_at:'invalid'}},
  {name:'invalid-end',row:{status:'active',access_ends_at:'invalid'}},
  {name:'before-start',row:{status:'active',access_starts_at:at(172800000)}},
  {name:'expired',row:{status:'active',access_ends_at:at(-172800000)}},
];
test('5,000 synthetic personas retain purchase boundaries and learner access, including graduates', () => {
  const ids = new Set();
  for (const person of people) for (const offer of offers) for (const state of access) for (const [index, time] of times.entries()) {
    const id = [person,offer.name,state.name,time].join('/'); ids.add(id);
    const now = epoch + time;
    assert.equal(isPurchasableOffer(offer.course,offer.cohort,now), offer.buy?.[index] || false, `${id}: purchase`);
    assert.equal(isRecruiting(offer.cohort,now), offer.recruit?.[index] || false, `${id}: recruitment`);
    const ownsEnrollment = ['learner','graduate','administrator'].includes(person);
    const enrollment = ownsEnrollment ? {...state.row,completion_status:person === 'graduate' ? 'graduated' : 'in_progress'} : {status:'none'};
    assert.equal(hasLearningAccess(enrollment,now), ownsEnrollment && Boolean(state.allow?.[index]), `${id}: learning`);
  }
  assert.equal(ids.size, 5000);
});
