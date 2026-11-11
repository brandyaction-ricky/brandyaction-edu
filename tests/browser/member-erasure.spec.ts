import {expect,test} from '@playwright/test';
const actor={id:'00000000-0000-4000-8000-000000000002',email:'synthetic@example.test',full_name:'검수 관리자',phone:null,role:'admin'};
const requestId='00000000-0000-4000-8000-000000000007';
const row={requestId,memberId:actor.id,state:'retry',receivedAt:'2026-10-04T00:00:00Z',deadlineAt:'2026-11-03T00:00:00Z',nextAttemptAt:'2026-10-04T00:05:00Z',attempts:1,uncertainAttempts:0,counts:{sessions:4,report_jobs:2},storageRemoved:1,storageFailedCount:1,lastCode:'STORAGE_PENDING',completedAt:null,approvedAt:'2026-10-04T00:00:00Z',disabledAt:'2026-10-04T00:00:00Z',authErasedAt:null,memberName:'가상 수강생',memberEmail:'learner@example.test'};
const screen='/public-data-test?publicScreen=admin%2Fcustomers';
test.beforeEach(async({page})=>{
  await page.route('**/api/platform?**',route=>route.fulfill({json:{user:actor,data:{profiles:[],admin_summary:[]},pagination:{page:1,pageSize:20,total:0},support:{}}}));
});
test('real administrator member page shows intake only until erasure is enabled',async({page})=>{
  await page.route('**/api/admin/member-erasure',route=>route.fulfill({json:{enabled:false,rows:[{...row,state:'requested',storageFailedCount:0,lastCode:null}]}}));
  await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
  await expect(area).toBeVisible();await expect(area).toContainText('지금은 요청만 접수합니다.');
  await expect(area.getByRole('button',{name:'같은 요청으로 다시 시도'})).toHaveCount(0);
  await expect(area.getByRole('link',{name:'해당 회원 확인'})).toHaveAttribute('href',`/admin/customers?member=${actor.id}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('partial storage retry keeps the ID and confirmed counts and shows completion only after all files are removed',async({page},info)=>{
  let retried=false;
  await page.route('**/api/admin/member-erasure',async route=>{
    if(route.request().method()==='POST'){expect(route.request().postDataJSON()).toEqual({action:'execute',requestId,confirmation:requestId});retried=true;await route.fulfill({status:202,json:{ok:true}});}
    else await route.fulfill({json:{enabled:true,rows:[retried?{...row,state:'complete',storageRemoved:2,storageFailedCount:0,lastCode:null,completedAt:'2026-10-04T00:06:00Z',uncertainAttempts:1}:row]}});
  });
  await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
  await expect(area).toContainText('남은 파일 1개');await expect(area.getByText('삭제 완료',{exact:true})).toHaveCount(0);
  await area.getByRole('button',{name:'처리 이어가기'}).click();
  await expect(area.getByRole('button',{name:'탈퇴 처리 실행'})).toBeDisabled();
  await area.getByRole('checkbox',{name:'대상 회원과 삭제 내용을 확인했습니다.'}).check();
  await area.getByRole('button',{name:'탈퇴 처리 실행'}).click();
  await expect(area).toContainText('삭제 완료');await expect(area).toContainText('진단 기록 6건');await expect(area).toContainText('파일 2개');await expect(area).toContainText('실제 삭제 건수는 더 많을 수 있습니다.');
  await expect(area.getByText(requestId,{exact:true})).not.toBeVisible();
  await area.getByText('요청 상세 보기',{exact:true}).click();
  await expect(area.getByText(requestId,{exact:true})).toBeVisible();await expect(area).toContainText('확인된 건수입니다.');
  await area.getByText('요청 상세 보기',{exact:true}).click();
  await expect(area.getByRole('button',{name:'같은 요청으로 다시 시도'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await area.screenshot({path:info.outputPath(`erasure-records-${info.project.name}.png`)});
});
test('staff does not see administrator erasure records',async({page})=>{
  let reads=0;
  await page.route('**/api/platform?**',route=>route.fulfill({json:{user:{...actor,role:'staff'},data:{profiles:[],admin_summary:[]},support:{}}}));
  await page.route('**/api/admin/member-erasure',route=>{reads++;return route.fulfill({json:{enabled:false,rows:[]}});});
  await page.goto(screen);await expect(page.getByText('이 화면에 접근할 운영 권한이 필요합니다.',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'})).toHaveCount(0);expect(reads).toBe(0);
});
test('failed records load offers retry without claiming an empty queue',async({page})=>{
  let failure=true;
  await page.route('**/api/admin/member-erasure',route=>route.fulfill(failure?{status:503,json:{error:'기록을 불러오지 못했습니다.'}}:{json:{enabled:false,rows:[]}}));
  await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
  await expect(area.getByRole('alert')).toBeVisible();await expect(area).not.toContainText('접수된 탈퇴 요청이 없습니다.');
  failure=false;await area.getByRole('button',{name:'처리 상태 새로고침'}).click();await expect(area).toContainText('접수된 탈퇴 요청이 없습니다.');
});

test('pending request requires per-member review and explicit confirmation; cancel is read-only',async({page},info)=>{
 let writes=0;
 await page.route('**/api/admin/member-erasure',async route=>{
  if(route.request().method()==='POST'){writes++;expect(route.request().postDataJSON()).toEqual({action:'execute',requestId,confirmation:requestId});await route.fulfill({status:202,json:{ok:true,message:'탈퇴 처리를 시작했습니다.'}});}
  else await route.fulfill({json:{enabled:true,rows:[{...row,counts:{},storageRemoved:0,storageFailedCount:0,lastCode:null,state:'requested',approvedAt:writes?'2026-11-09T00:00:00Z':null,disabledAt:writes?'2026-11-09T00:00:00Z':null}]}});
 });
 await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
 await area.getByRole('button',{name:'승인 후 탈퇴 처리'}).click();
 const confirm=area.getByRole('region',{name:'탈퇴 처리 확인'});
 await expect(confirm).toContainText('learner@example.test');await expect(confirm).toContainText('결제·환불');
 await expect(confirm.getByRole('button',{name:'승인하고 탈퇴 처리'})).toBeDisabled();
 await confirm.getByRole('button',{name:'돌아가기'}).click();expect(writes).toBe(0);
 await area.getByRole('button',{name:'승인 후 탈퇴 처리'}).click();
 await confirm.getByRole('checkbox').check();
 await area.screenshot({path:info.outputPath('erasure-confirm.png')});
 await confirm.getByRole('button',{name:'승인하고 탈퇴 처리'}).click();
 await expect(area).toContainText('삭제 진행 대기');expect(writes).toBe(1);
 await expect(area.getByText('삭제 완료',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('approved deletion status refreshes automatically without another destructive request and stops polling on completion',async({page})=>{
 await page.clock.install();let complete=false,reads=0,writes=0;
 await page.route('**/api/admin/member-erasure',route=>{
  if(route.request().method()==='POST')writes++;else reads++;
  return route.fulfill({json:{enabled:true,rows:[complete?{...row,state:'complete',storageFailedCount:0,lastCode:null,completedAt:'2026-11-11T00:00:00Z'}:row]}});
 });
 await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
 await expect(area).toContainText('상태가 자동으로 갱신됩니다.');const initial=reads;complete=true;
 await page.clock.runFor(10010);await expect(area).toContainText('삭제 완료');expect(reads).toBe(initial+1);expect(writes).toBe(0);
 await page.clock.runFor(20010);expect(reads).toBe(initial+1);
});

test('structural failure is shown as a server review instead of another automatic retry',async({page})=>{
 await page.route('**/api/admin/member-erasure',route=>route.fulfill({json:{enabled:true,rows:[{...row,state:'blocked',lastCode:'LOCAL_ERASURE_REVIEW_REQUIRED'}]}}));
 await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
 await expect(area).toContainText('관리자 확인 필요');await expect(area).toContainText('반복 실행으로 해결되지 않으므로');
 await expect(area).not.toContainText('상태가 자동으로 갱신됩니다.');
});

test('cancel an unapproved intake while deletion is OFF; keep the cancellation receipt and never expose cancellation after approval',async({page},info)=>{
 let cancelled=false,writes=0;
 await page.route('**/api/admin/member-erasure',async route=>{
  if(route.request().method()==='POST'){
   expect(route.request().postDataJSON()).toEqual({action:'cancel',requestId,confirmation:requestId});writes++;cancelled=true;
   return route.fulfill({json:{ok:true,message:'탈퇴 접수를 취소했습니다. 회원 계정과 수강권은 유지됩니다.'}});
  }
  return route.fulfill({json:{enabled:false,rows:[{...row,state:cancelled?'cancelled':'requested',attempts:0,approvedAt:null,disabledAt:null,lastCode:null,counts:{},storageRemoved:0,storageFailedCount:0,cancelledAt:cancelled?'2026-11-11T00:00:00Z':null}]}});
 });
 await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
 await expect(area).toContainText('승인 대기');await expect(area.getByRole('button',{name:'승인 후 탈퇴 처리'})).toHaveCount(0);
 await area.getByRole('button',{name:'접수 취소',exact:true}).click();
 const confirm=area.getByRole('region',{name:'탈퇴 접수 취소 확인'});
 await expect(confirm).toContainText('계정·수강권·학습 자료는 그대로 유지');await expect(confirm.getByRole('button',{name:'접수 취소 확정'})).toBeDisabled();
 await confirm.getByRole('button',{name:'돌아가기'}).click();expect(writes).toBe(0);
 await area.getByRole('button',{name:'접수 취소',exact:true}).click();await confirm.getByRole('checkbox').check();await confirm.getByRole('button',{name:'접수 취소 확정'}).click();
 await expect(area).toContainText('0건 처리 대기');await expect(area).toContainText('0건 삭제 완료');await expect(area).toContainText('1건 접수 취소');
 await expect(area.getByRole('button',{name:'접수 취소',exact:true})).toHaveCount(0);expect(writes).toBe(1);
 await area.screenshot({path:info.outputPath(`erasure-cancelled-${info.project.name}.png`)});
});

test('approved deletion cannot be cancelled or shown as restored',async({page})=>{
 await page.route('**/api/admin/member-erasure',route=>route.fulfill({json:{enabled:true,rows:[row]}}));
 await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
 await expect(area).toContainText('이미 승인되어 접수 취소는 할 수 없습니다.');await expect(area.getByRole('button',{name:'접수 취소',exact:true})).toHaveCount(0);
 await expect(area.getByRole('button',{name:'처리 이어가기'})).toBeVisible();
});
