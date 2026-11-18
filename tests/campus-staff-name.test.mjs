import test from 'node:test';
import assert from 'node:assert/strict';
import { campusName, staffLikeName, assertCampusName } from '../lib/campus-staff-name.ts';
test('members cannot look like staff; staff names always show the mark',()=>{
 for(const n of ['운영팀','문샷 운영진','멘토 김','관리자','브랜디 액션','BrandyAction','MOONSHOT TEAM','공식 계정','Admin','멘·토'])assert.equal(campusName(n,'student'),null,n);
 for(const n of ['별 동료','공방 사장','문샷 3기'])assert.equal(campusName(n,'student'),n);
 assert.equal(campusName('지윤','staff'),'운영진 · 지윤');assert.equal(campusName('운영진 · 지윤','staff'),'운영진 · 지윤');assert.equal(campusName('브랜디액션 정호','admin'),'브랜디액션 정호');
 assert.ok(staffLikeName('운영진 · 지윤'));
 assert.throws(()=>assertCampusName('운영팀',null),e=>e.status===400);
});
