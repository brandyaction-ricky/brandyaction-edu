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
