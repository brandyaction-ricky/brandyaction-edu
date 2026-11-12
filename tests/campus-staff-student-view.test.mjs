import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('staff with an enrollment get the member screen as students; without one they keep the review',()=>{
 const page=readFileSync('app/campus/workspace/page.tsx','utf8');
 assert.match(page,/if\(staff&&!q\.enrollmentId&&!\(await hasEnrollment\(user\.id\)\)\)redirect\(campusReviewPath\(\)\)/);
 assert.match(page,/operator=\{\(!staff\|\|asAdmin\)&&!!await getOperatorUser\('members',user\)\}/);
});
test('staff and administrators always have the office, students only behind the switch or a pilot',()=>{
 assert.match(readFileSync('app/api/campus/office/route.ts','utf8'),/EDU_CAMPUS_OFFICE_ENABLED === 'true' \|\| canReviewCampus\(await getAuthenticatedUser\(\)\)/);
 assert.match(readFileSync('app/api/campus/office/agents/route.ts','utf8'),/EDU_CAMPUS_OFFICE_ENABLED==='true'\|\|canReviewCampus\(user\)/);
 const sql=readFileSync('supabase/migrations/20261112093000_campus_staff_reporting_access.sql','utf8');
 assert.match(sql,/s\.role in \('admin','staff'\) and s\.status='active'/);
});
test('the campus opens on the newest enrollment when none is requested',()=>{
 assert.match(readFileSync('features/campus/repository.ts','utf8'),/\.eq\('status', 'active'\)\.order\('created_at', \{ ascending: false \}\)\.limit\(200\)/);
});
test('the growth board shows course-wide days in week order, read with the member client',()=>{
 const repo=readFileSync('features/campus/repository.ts','utf8');
 assert.match(repo,/const courseLessons=allWeeks\.length\?await rows\(db\.from\('curriculum_lessons'\)/);
 assert.match(repo,/curriculumDayNumbers\(\{curriculum_weeks:allWeeks,curriculum_lessons:courseLessons\}\)/);
 assert.match(readFileSync('features/campus/snapshot.ts','utf8'),/day: input\.dayNumbers\?\.get\(str\(l\.id\)\) \?\? \(Number\(l\.day_number\) \|\| 0\)/);
 assert.match(readFileSync('features/campus/learner-metrics.ts','utf8'),/\(a\.week \?\? 1\) - \(b\.week \?\? 1\) \|\| a\.day - b\.day/);
 const board=readFileSync('features/campus/ui/dashboard.tsx','utf8');
 assert.ok(!board.includes('21일 지도'));assert.match(board,/\(step\.week \?\? 1\) <= 0 \? '준비' : 'DAY'/);
});
