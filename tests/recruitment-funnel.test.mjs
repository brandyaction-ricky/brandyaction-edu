import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('../lib/recruitment-funnel.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exports);
const { validateFunnelDraft } = exports;
const courses = [{ id: 'free', title: 'Sample free class' }, { id: 'paid', title: 'Sample paid class' }];
const cohorts = [{ id: 'session', course_id: 'free', name: 'Session' }, { id: 'cohort', course_id: 'paid', name: 'Cohort' }];
const draft = { freeCourseId: 'free', paidCourseId: 'paid', paidCohortId: 'cohort' };

test('a cohort from a different course cannot complete the funnel draft', () => {
  assert.equal(validateFunnelDraft({ ...draft, paidCohortId: 'session' }, courses, cohorts).valid, false);
});
test('a removed product or cohort invalidates a previously valid draft', () => {
  assert.equal(validateFunnelDraft(draft, courses, cohorts).valid, true);
  assert.equal(validateFunnelDraft(draft, courses.slice(0, 1), cohorts).valid, false);
  assert.equal(validateFunnelDraft(draft, courses, cohorts.slice(0, 1)).valid, false);
});
test('same product cannot silently stand in for both free and paid offers', () => {
  assert.equal(validateFunnelDraft({ ...draft, paidCourseId: 'free', paidCohortId: 'session' }, courses, cohorts).valid, false);
});

test('free education needs no cohort while the paid cohort remains required', () => {
  assert.equal(validateFunnelDraft(draft, courses, cohorts.filter(x => x.course_id === 'paid')).valid, true);
  assert.equal(validateFunnelDraft({...draft, paidCohortId:''}, courses, cohorts).valid, false);
});
