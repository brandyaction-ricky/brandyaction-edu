import {expect,test} from '@playwright/test';
const actor={id:'00000000-0000-4000-8000-000000000002',email:'synthetic@example.test',full_name:'검수 관리자',phone:null,role:'admin'};
const requestId='00000000-0000-4000-8000-000000000007';
const row={requestId,memberId:actor.id,state:'retry',receivedAt:'2026-10-04T00:00:00Z',deadlineAt:'2026-11-03T00:00:00Z',nextAttemptAt:'2026-10-04T00:05:00Z',attempts:1,uncertainAttempts:0,counts:{sessions:4,report_jobs:2},storageRemoved:1,storageFailedCount:1,lastCode:'STORAGE_PENDING',completedAt:null};
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
    if(route.request().method()==='POST'){expect(route.request().postDataJSON()).toEqual({requestId});retried=true;await route.fulfill({status:202,json:{ok:true}});}
    else await route.fulfill({json:{enabled:true,rows:[retried?{...row,state:'complete',storageRemoved:2,storageFailedCount:0,lastCode:null,completedAt:'2026-10-04T00:06:00Z',uncertainAttempts:1}:row]}});
  });
  await page.goto(screen);const area=page.getByRole('region',{name:'탈퇴 요청·진단 삭제 기록'});
  await expect(area).toContainText('남은 파일 1개');await expect(area.getByText('삭제 완료',{exact:true})).toHaveCount(0);
  await area.getByRole('button',{name:'같은 요청으로 다시 시도'}).click();
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
