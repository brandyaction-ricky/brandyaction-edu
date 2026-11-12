import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('staff reach the member screen only through the explicit student view, without operator powers',()=>{
 const page=readFileSync('app/campus/workspace/page.tsx','utf8');
 assert.match(page,/const asStudent=q\.as==='student';if\(canReviewCampus\(user\)&&!q\.enrollmentId&&!asStudent\)redirect\(campusReviewPath\(\)\)/);
 assert.match(page,/operator=\{!asStudent&&!!await getOperatorUser\('members',user\)\}/);
 assert.match(readFileSync('features/campus/tour/preview.tsx','utf8'),/href="\/campus\/workspace\?as=student">수강생 화면으로 체험 →<\/a>/);
});
