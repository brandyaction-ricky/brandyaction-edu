import test from 'node:test';
import assert from 'node:assert/strict';
import { days } from './helpers/curriculum-days.mjs';
const week = (id, n, course = 'course', extra = {}) => ({ id, course_id: course, week_number: n, ...extra });
const lesson = (id, w, n, extra = {}) => ({ id, week_id: w, day_number: n, ...extra });
const model = () => ({curriculum_weeks: [week('w2',2),week('w0',0),week('w1',1)], curriculum_lessons: [lesson('intro','w0',1),...Array.from({length:5},(_,i)=>lesson('a'+i,'w1',i+1)),lesson('b','w2',1),lesson('c','w2',2)]});
test('week two continues at six; preparation week does not consume day one', () => {
 const data=model(), original=structuredClone(data), result=days.curriculumDayNumbers(data);
 assert.equal(result.get('intro'),1);assert.equal(result.get('a0'),1);assert.equal(result.get('a4'),5);assert.equal(result.get('b'),6);assert.equal(result.get('c'),7);assert.deepEqual(data,original);
});
test('counts actual active lessons, compacts archived gaps, and keeps unpublished positions', () => {
 const data=model();data.curriculum_lessons[2].archived_at='2026-01-01';data.curriculum_lessons[3].is_published=false;data.curriculum_lessons[4].day_number=100;
 const result=days.curriculumDayNumbers(data);assert.equal(result.has('a1'),false);assert.equal(result.get('a2'),2);assert.equal(result.get('a3'),4);assert.equal(result.get('b'),5);
});
test('course numbering is independent and archived weeks contribute no lessons', () => {
 const data=model();data.curriculum_weeks.push(week('other',1,'other-course'),week('deleted',1,'course',{archived_at:'2026-01-01'}));data.curriculum_lessons.push(lesson('other-lesson','other',1),lesson('deleted-lesson','deleted',1));
 const result=days.curriculumDayNumbers(data);assert.equal(result.get('other-lesson'),1);assert.equal(result.has('deleted-lesson'),false);assert.equal(result.get('b'),6);
});
test('reordering weeks/lessons and inserting a lesson recalculates subsequent days', () => {
 const data=model();data.curriculum_weeks[0].week_number=0.5;let result=days.curriculumDayNumbers(data);assert.equal(result.get('b'),1);assert.equal(result.get('a0'),3);
 data.curriculum_weeks[0].week_number=2;data.curriculum_lessons.find(l=>l.id==='c').day_number=0;data.curriculum_lessons.push(lesson('added','w1',6));result=days.curriculumDayNumbers(data);assert.equal(result.get('c'),7);assert.equal(result.get('b'),8);
});
test('server ordinal survives partial visibility; unnumbered legacy rows fall back safely', () => {
 const row=lesson('b','w2',1,{curriculum_day_number:6});assert.equal(days.curriculumDay({curriculum_weeks:[week('w2',2)],curriculum_lessons:[row]},row),6);
 assert.equal(days.curriculumDay({},lesson('missing','missing',8)),8);assert.equal(days.curriculumDay({},undefined),0);
});
