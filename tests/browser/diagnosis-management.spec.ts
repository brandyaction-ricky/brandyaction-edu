import{test,expect}from'@playwright/test';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,version='a'.repeat(64);
const report={state:'needs_review',updatedAt:'2026-10-03T00:00:00Z',checkedAt:'2026-10-03T00:01:00Z',errorCode:'JOB_DEADLINE_REACHED',canRetry:true,version,details:[{at:'2026-10-03T00:00:00Z',code:'JOB_DEADLINE_REACHED'}]};
const data={enabled:true,allPublished:false,revision:0,eligibleCount:103,startedCount:2,nextCursor:id(90),remoteAvailable:true,rows:[{id:id(1),name:'학생 A',published:false,attemptId:id(10),state:'submitted',startedAt:'2026-10-03T00:00:00Z',updatedAt:'2026-10-03T00:00:00Z',report,statusAvailable:true},{id:id(2),name:'학생 B',published:false,attemptId:null,state:'not_started',startedAt:null,updatedAt:null,report:null,statusAvailable:true},{id:id(3),name:'학생 C',published:true,attemptId:id(11),state:'submitted',report:{...report,state:'ready',errorCode:null,canRetry:false,details:[]},statusAvailable:true}]};
test.beforeEach(async({page})=>{
 await page.route('**/api/platform?**',route=>route.fulfill({json:{user:{id:id(99),full_name:'합성 관리자',role:'admin'},data:{admin_summary:[{pendingReviews:0,openQuestions:0}]}}}));
});
test('timeline separates start, submit, issue in Korea time and keeps polling time inside history',async({page})=>{
 const row={...data.rows[2],report:{...report,state:'ready',canRetry:false,errorCode:null,startedAt:'2026-10-04T11:24:00Z',submittedAt:'2026-10-04T23:30:00Z',issuedAt:'2026-10-05T00:40:00Z',checkedAt:'2026-10-06T00:00:00Z'}};
 await page.route('**/api/admin/diagnosis**',r=>r.fulfill({json:{...data,rows:[row]}}));
 await page.goto('/diagnosis-test?manage');const item=page.getByRole('row',{name:/학생 C/});
 await expect(item.getByText(/검사 시작 2026\. 10\. 4\. 오후 08:24/)).toBeVisible();
 await expect(item.getByText(/제출 완료 2026\. 10\. 5\. 오전 08:30/)).toBeVisible();
 await expect(item.getByText(/보고서 발급 2026\. 10\. 5\. 오전 09:40/)).toBeVisible();
 await expect(item.getByText(/상태 조회:/)).not.toBeVisible();await item.getByText('진행·오류 기록 보기').click();
 await expect(item.getByText(/상태 조회: 2026\. 10\. 6\./)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('admin can find direct diagnosis, confirm whole or individual publication and see progress without document overflow',async({page},info)=>{
 const writes:unknown[]=[];let latest=data;
 await page.route('**/api/admin/diagnosis**',async route=>{if(route.request().method()==='POST'){const b=route.request().postDataJSON();writes.push(b);latest={...latest,revision:latest.revision+1,allPublished:b.action==='publish_all'?b.enabled:latest.allPublished,rows:latest.rows.map(r=>b.action==='publish_all'||b.userId===r.id?{...r,published:b.enabled}:r)};await route.fulfill({json:{revision:latest.revision}});return;}await route.fulfill({json:latest});});
 await page.goto('/diagnosis-test?manage');await expect(page.getByRole('heading',{name:'N6 진단 관리',exact:true})).toBeVisible();await expect(page.locator('.diagnosis-management').getByRole('link',{name:'N6 진단 받기'})).toHaveAttribute('href','/admin/diagnosis');
 await page.getByRole('button',{name:'한 번에 모두 공개'}).click();await expect(page.getByRole('dialog')).toContainText('103명');await page.getByRole('button',{name:'취소',exact:true}).click();expect(writes).toHaveLength(0);
 await page.getByRole('button',{name:'학생 B 진단 공개'}).click();await expect(page.getByRole('dialog')).toContainText('학생 B');await page.getByRole('button',{name:'공개하기',exact:true}).click();await expect(page.getByRole('button',{name:'학생 B 진단 닫기'})).toBeVisible();expect(writes[0]).toMatchObject({action:'publish_member',userId:id(2),revision:0,enabled:true});
 await page.getByRole('button',{name:'한 번에 모두 공개'}).click();await page.getByRole('button',{name:'공개하기',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'진단 공개 설정을 저장했습니다.'})).toBeVisible();expect(writes[1]).toMatchObject({action:'publish_all',revision:1});
 await page.screenshot({path:info.outputPath('diagnosis-management.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('diagnosis management retains admin navigation and mobile menu without changing publication',async({page},info)=>{
 const writes:unknown[]=[];
 await page.route('**/api/admin/diagnosis**',async route=>{if(route.request().method()==='POST')writes.push(route.request().postDataJSON());await route.fulfill({json:data});});
 await page.goto('/diagnosis-test?manage');await expect(page.getByRole('heading',{name:'N6 진단 관리',exact:true})).toBeVisible();
 const sidebar=page.locator('#admin-sidebar');
 if(info.project.name!=='desktop')await page.getByRole('button',{name:'관리자 메뉴 열기'}).click();
 await expect(sidebar).toBeVisible();await expect(sidebar.getByRole('link',{name:'N6 진단 관리',exact:true})).toHaveAttribute('aria-current','page');
 await sidebar.locator('summary').filter({hasText:'고객 관리'}).click();await expect(sidebar.getByRole('link',{name:'회원 관리',exact:true})).toHaveAttribute('href','/admin/customers');
 await sidebar.getByRole('link',{name:'회원 관리',exact:true}).click();await expect(page).toHaveURL(/\/admin\/customers$/);
 await page.goBack();await expect(page.getByRole('heading',{name:'N6 진단 관리',exact:true})).toBeVisible();
 if(info.project.name!=='desktop'){const opener=page.getByRole('button',{name:'관리자 메뉴 열기'});await opener.click();await page.keyboard.press('Escape');await expect(sidebar).not.toBeVisible();await expect(opener).toBeFocused();}
 await expect(page.getByRole('button',{name:'한 번에 모두 공개'})).toBeEnabled();
 expect(writes).toHaveLength(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('diagnosis-management-navigation.png'),fullPage:true});
});
test('retry confirms frozen answers and uses same request after lost acknowledgment; ready reports never offer regeneration',async({page})=>{
 const writes:Record<string,unknown>[]=[];let lost=true;
 await page.route('**/api/admin/diagnosis**',async route=>{if(route.request().method()==='POST'){writes.push(route.request().postDataJSON());if(lost){lost=false;await route.abort();return;}await route.fulfill({json:{state:'queued'}});return;}await route.fulfill({json:data});});
 await page.goto('/diagnosis-test?manage');const row=page.getByRole('row',{name:/학생 A/}),ready=page.getByRole('row',{name:/학생 C/});await expect(ready.getByRole('button',{name:'보고서 재발급'})).toBeDisabled();await row.getByText('진행·오류 기록 보기').click();await expect(row).toContainText('JOB_DEADLINE_REACHED');
 await row.getByRole('button',{name:'보고서 재발급'}).click();await expect(page.getByRole('dialog')).toContainText('검사를 다시 할 필요는 없습니다');await page.getByRole('button',{name:'저장된 답변으로 재발급'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'저장된 답변으로 재발급'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);expect(writes[0]).toMatchObject({action:'retry',attemptId:id(10),expectedVersion:version});
});
test('temporary remote outage shows last check and disables retry; failed reads disable all changes',async({page})=>{
 let failed=false;await page.route('**/api/admin/diagnosis**',route=>route.fulfill(failed?{status:503,json:{error:'조회할 수 없습니다.'}}:{json:{...data,remoteAvailable:false,rows:data.rows.map(r=>({...r,statusAvailable:false,report:r.report?{...r.report,canRetry:false}:null}))}}));
 await page.goto('/diagnosis-test?manage');await expect(page.getByText(/마지막 확인 기록/)).toBeVisible();for(const b of await page.getByRole('button',{name:'보고서 재발급'}).all())await expect(b).toBeDisabled();failed=true;await page.locator('#admin-content').getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.getByRole('alert')).toContainText('조회할 수 없습니다');await expect(page.getByRole('button',{name:'한 번에 모두 공개'})).toBeDisabled();
});
test('pagination and search use bounded server pages; 320px layout keeps controls readable',async({page},info)=>{
 const queries:string[]=[];await page.route('**/api/admin/diagnosis**',async route=>{queries.push(route.request().url());await route.fulfill({json:data});});await page.setViewportSize({width:320,height:844});await page.goto('/diagnosis-test?manage');await page.getByRole('button',{name:'다음',exact:true}).click();await expect.poll(()=>queries.at(-1)).toContain('before=');await page.getByRole('textbox',{name:'수강생 이름'}).fill('학생 A');await page.getByRole('button',{name:'검색',exact:true}).click();await expect.poll(()=>queries.at(-1)).toContain('query=');expect(new URL(queries.at(-1)!).searchParams.has('before')).toBe(false);await page.screenshot({path:info.outputPath('diagnosis-management-320.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('queue observation is visible but stale positions disappear when live lookup fails',async({page})=>{
 let available=true;const queue={queuePosition:3,queuedAt:'2026-10-06T00:00:00Z',queueObservedAt:'2026-10-06T01:00:00Z'};
 await page.route('**/api/admin/diagnosis**',r=>r.fulfill({json:{...data,remoteAvailable:available,rows:[{...data.rows[0],statusAvailable:available,report:{...report,state:'queued',canRetry:false,...queue}}]}}));
 await page.goto('/diagnosis-test?manage');await expect(page.getByText('대기 3번째')).toBeVisible();await expect(page.getByText('접수 2026. 10. 6. 오전 09:00')).toBeVisible();
 await expect(page.getByText(/완료 예정 시간을 뜻하지/)).toBeVisible();available=false;await page.locator('#admin-content').getByRole('button',{name:'새로고침',exact:true}).click();await expect(page.getByText('대기 3번째')).toHaveCount(0);
});
test('review without a code explains disabled action instead of silently hiding the reason',async({page})=>{
 await page.route('**/api/admin/diagnosis**',r=>r.fulfill({json:{...data,rows:[{...data.rows[0],report:{...report,errorCode:null,canRetry:false,details:[]}}]}}));
 await page.goto('/diagnosis-test?manage');await expect(page.getByText(/보고서 검토가 필요해 발급이 보류/)).toBeVisible();await expect(page.getByRole('button',{name:'보고서 재발급'})).toBeDisabled();
 await page.getByText('진행·오류 기록 보기').click();await expect(page.getByText('서버에서 상세 사유를 아직 제공하지 않았습니다.')).toBeVisible();
});
test('rewrite requires explicit capability and confirmation, preserves request after lost response',async({page},info)=>{
 const writes:Record<string,unknown>[]=[];let permitted=false;
 await page.route('**/api/admin/diagnosis**',r=>{if(r.request().method()==='POST'){writes.push(r.request().postDataJSON());return writes.length===1?r.abort():r.fulfill({json:{state:'queued'}});}return r.fulfill({json:{...data,rows:[{...data.rows[0],report:{...report,errorCode:'COMPLETION_REVIEW_REQUIRED',retryMode:permitted?'rewrite':null,rewritesRemaining:2}}]}});});
 await page.goto('/diagnosis-test?manage');await expect(page.getByRole('button',{name:'보고서 재발급'})).toBeDisabled();permitted=true;await page.locator('#admin-content').getByRole('button',{name:'새로고침',exact:true}).click();
 await page.getByRole('button',{name:'보고서 새로 작성'}).click();const modal=page.getByRole('dialog');await expect(modal).toContainText('약 1.3달러');await expect(modal).toContainText('최대 2회');expect(writes).toHaveLength(0);
 await page.screenshot({path:info.outputPath('n6-rewrite-confirmation.png'),fullPage:true});
 await modal.getByRole('button',{name:'비용 확인 후 새로 작성'}).click();await expect(modal.getByRole('alert')).toBeVisible();await modal.getByRole('button',{name:'비용 확인 후 새로 작성'}).click();await expect(modal).toHaveCount(0);expect(writes[1]).toEqual(writes[0]);expect(writes[0]).toMatchObject({retryMode:'rewrite',expectedVersion:version});
});
test('member link selects exact member outside the first page without offering bulk publication',async({page})=>{
 const requests:string[]=[];await page.route('**/api/admin/diagnosis**',r=>{requests.push(r.request().url());return r.fulfill({json:{...data,nextCursor:null,rows:[data.rows[0]]}});});
 await page.goto(`/diagnosis-test?manage&member=${id(1)}`);await expect(page.getByText('알림에서 선택한 수강생의 진단입니다.')).toBeVisible();expect(new URL(requests.at(-1)!).searchParams.get('member')).toBe(id(1));
 await expect(page.getByRole('button',{name:'한 번에 모두 공개'})).toHaveCount(0);await expect(page.getByRole('link',{name:'이 수강생 바로가기'})).toHaveAttribute('href',`/admin/diagnosis/manage?member=${id(1)}`);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('second rewrite shows remaining allowance and uses a new request after an accepted first rewrite',async({page},info)=>{
 const writes:Record<string,unknown>[]=[];let remaining=2;
 await page.route('**/api/admin/diagnosis**',r=>{
  if(r.request().method()==='POST'){writes.push(r.request().postDataJSON());remaining--;return r.fulfill({json:{state:'queued'}});}
  return r.fulfill({json:{...data,rows:[{...data.rows[0],report:{...report,errorCode:'COMPLETION_REVIEW_REQUIRED',canRetry:remaining>0,retryMode:remaining>0?'rewrite':null,rewritesRemaining:remaining,version:(remaining===2?'a':'b').repeat(64)}}]}});
 });
 await page.goto('/diagnosis-test?manage');
 for(const count of [2,1]){
  await expect(page.getByText(`새로 작성 최대 2회 · 남은 ${count}회`,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'보고서 새로 작성',exact:true}).click();const modal=page.getByRole('dialog');
  await expect(modal).toContainText(`현재 남은 ${count}회 중 1회를 사용`);await expect(modal).toContainText('약 1.3달러');
  if(count===1)await page.screenshot({path:info.outputPath('n6-rewrite-remaining-one.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await modal.getByRole('button',{name:'비용 확인 후 새로 작성'}).click();await expect(modal).toHaveCount(0);
 }
 expect(writes).toHaveLength(2);expect(writes[0].requestId).not.toBe(writes[1].requestId);
 expect(writes[1]).toMatchObject({retryMode:'rewrite',expectedVersion:'b'.repeat(64)});
 await expect(page.getByText('새로 작성 최대 2회 · 남은 0회',{exact:true})).toBeVisible();
 await expect(page.getByText('새로 작성 기회를 모두 사용했습니다. 운영 담당자의 확인이 필요합니다.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'보고서 재발급',exact:true})).toBeDisabled();
});

test('unknown, invalid, exhausted or stale allowance cannot start a paid rewrite',async({page})=>{
 let count:unknown=null,available=true;const writes:unknown[]=[];
 await page.route('**/api/admin/diagnosis**',r=>{
  if(r.request().method()==='POST')writes.push(r.request().postDataJSON());
  return r.fulfill({json:{...data,remoteAvailable:available,rows:[{...data.rows[0],statusAvailable:available,report:{...report,errorCode:'COMPLETION_REVIEW_REQUIRED',retryMode:'rewrite',rewritesRemaining:count}}]}});
 });
 await page.goto('/diagnosis-test?manage');
 for(const value of [null,undefined,-1,3,1.5,'1',0]){
  count=value;await page.locator('#admin-content').getByRole('button',{name:'새로고침',exact:true}).click();
  await expect(page.getByRole('button',{name:'보고서 새로 작성',exact:true})).toBeDisabled();
  if(value!==0)await expect(page.getByText('남은 횟수를 확인하지 못했습니다. 새로고침 후 다시 확인해 주세요.',{exact:true})).toBeVisible();
 }
 count=1;available=false;await page.locator('#admin-content').getByRole('button',{name:'새로고침',exact:true}).click();
 await expect(page.getByText('새로 작성 최대 2회 · 남은 1회',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'보고서 새로 작성',exact:true})).toBeDisabled();expect(writes).toHaveLength(0);
});
