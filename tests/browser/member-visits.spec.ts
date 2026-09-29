import { test, expect, type Page } from '@playwright/test';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
async function backend(page:Page){
 let failure=false;const reads:string[]=[],writes:string[]=[];
 await page.route('**/api/admin/member-visits**',async route=>{
  const url=new URL(route.request().url());reads.push(url.search);if(failure){await route.fulfill({status:503,json:{error:'방문 조회 장애'}});return;}
  const member=url.searchParams.get('member'),number=Number(url.searchParams.get('page')||1),day=url.searchParams.get('day')||'2026-09-29';
  const rows=member?Array.from({length:21},(_,i)=>({member,name:'방문 시험 회원',phone:'010-0000-0000',day:`2026-09-${String(29-i).padStart(2,'0')}`,firstSeen:'2026-09-29T00:01:00Z',lastSeen:'2026-09-29T01:10:00Z'})):day==='2026-09-27'?[]:Array.from({length:21},(_,i)=>({member:id(i+2),name:`방문 시험 ${i+1}`,phone:'010-0000-0000',day,firstSeen:'2026-09-29T00:01:00Z',lastSeen:'2026-09-29T01:10:00Z'}));
  await route.fulfill({json:{rows:rows.slice((number-1)*20,number*20),total:rows.length,page:number,pageSize:20,day:member?null:day,asOf:'2026-09-29T01:12:00Z'}});
 });
 await page.route('**/api/admin/member-mvp**',route=>{const members=new URL(route.request().url()).searchParams.get('members')?.split(',')||[];return route.fulfill({json:{members:members.map(member=>({member,isMvp:member===id(2),color:null,revision:null})),defaultColor:'#AABB00',canManage:false}});});
 await page.route('**/api/admin/learning-progress**',route=>route.fulfill({json:{rows:[{enrollmentId:id(50),memberId:id(2),memberName:'방문 시험 1',memberEmail:'visitor@example.test',courseTitle:'시험 과정',cohortName:'4기',accessActive:true,status:'ready',tracks:[{track:'daily',total:30,completed:2,currentDay:3,nextDay:3,waiting:false,finished:false}]}],total:1,page:1,pageSize:20}}));
 await page.route('**/api/platform/member-visit',async route=>{writes.push(route.request().postData()||'empty');await route.fulfill(failure?{status:503,json:{error:'저장 실패'}}:{json:{ok:true}});});
 return {reads,writes,fail:(v:boolean)=>{failure=v;}};
}
test('actual customer list opens Korean-day visitors with MVP, lazy progress, date and page filters',async({page},info)=>{
 const server=await backend(page);await page.goto('/member-visits-test');await expect(page.getByRole('region',{name:'회원 방문 기록'})).toContainText('방문한 날짜 21일');
 expect(server.reads.every(query=>query.includes('member='))).toBe(true);await page.getByRole('button',{name:'수강생 방문 현황 보기'}).click();const panel=page.getByRole('region',{name:'수강생 방문 현황'});
 await expect(panel).toContainText('방문 수강생 21명');await expect(panel).toContainText('로그인 횟수나 실시간 접속 인원이 아닙니다');await expect(panel.locator('.member-mvp-badge')).toHaveText('우수 수강생');
 await expect(panel.getByRole('link',{name:'회원 상세 보기'}).first()).toHaveAttribute('href','/admin/customers?member='+id(2));
 await panel.getByRole('button',{name:'학습 진도 보기'}).first().click();await expect(panel).toContainText('현재 DAY 3');await expect(panel).toContainText('2 / 30개 완료');
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.evaluate(()=>document.documentElement.clientWidth));
 await page.screenshot({path:info.outputPath('member-visitors.png'),fullPage:false});
 await panel.getByRole('button',{name:'학습 진도 닫기'}).click();
 await panel.getByRole('button',{name:'다음',exact:true}).click();await expect(panel).toContainText('방문 시험 21');await expect(panel.locator('.member-visit')).toHaveCount(1);
 await panel.getByLabel('방문 날짜').fill('2026-09-27');await expect(panel).toContainText('해당 방문 기록이 없습니다');await panel.getByRole('button',{name:'오늘 보기'}).click();await expect(panel).toContainText('방문 시험 1');
});
test('member history pages and read errors are explicit and retryable',async({page})=>{
 const server=await backend(page);await page.goto('/member-visits-test');const history=page.getByRole('region',{name:'회원 방문 기록'});await expect(history).toContainText('2026-09-29');
 await history.getByRole('button',{name:'다음',exact:true}).click();await expect(history).toContainText('2026-09-09');await expect(history.locator('.member-visit')).toHaveCount(1);
 server.fail(true);await history.getByRole('button',{name:'방문 기록 새로고침'}).click();await expect(history.getByRole('alert')).toContainText('방문 조회 장애');await expect(history).not.toContainText('방문한 날짜 0일');
 server.fail(false);await history.getByRole('button',{name:'다시 시도'}).click();await expect(history).toContainText('방문한 날짜 21일');expect(server.writes).toHaveLength(0);
});
test('recorder deduplicates strict mode and route remounts, throttles and isolates identities',async({page})=>{
 const server=await backend(page);await page.clock.install({time:new Date('2026-09-29T01:00:00Z')});await page.goto('/member-visits-test?recorder');await expect.poll(()=>server.writes.length).toBe(1);
 await page.getByRole('button',{name:'다른 학습 페이지'}).click();await page.getByRole('button',{name:'다른 학습 페이지'}).click();expect(server.writes).toHaveLength(1);
 await page.clock.runFor(4*60_000);expect(server.writes).toHaveLength(1);await page.clock.runFor(60_000);await expect.poll(()=>server.writes.length).toBe(2);
 await page.getByRole('button',{name:'다른 회원'}).click();await expect.poll(()=>server.writes.length).toBe(3);expect(server.writes).toEqual(['empty','empty','empty']);
 await page.getByRole('button',{name:'로그인 상태 변경'}).click();await page.clock.runFor(6*60_000);expect(server.writes).toHaveLength(3);
});
test('recording failures never interrupt learning; hidden tabs and the off switch do not send',async({page})=>{
 const server=await backend(page);server.fail(true);await page.clock.install({time:new Date('2026-09-29T01:00:00Z')});await page.goto('/member-visits-test?recorder');await expect.poll(()=>server.writes.length).toBe(1);
 await page.getByLabel('학습 답변').fill('작성 중인 답변 유지');await expect(page.getByRole('alert')).toHaveCount(0);
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));await page.clock.runFor(6*60_000);expect(server.writes).toHaveLength(1);
 server.fail(false);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>server.writes.length).toBe(2);await expect(page.getByLabel('학습 답변')).toHaveValue('작성 중인 답변 유지');
 await page.goto('/member-visits-test?recorder&off');await page.clock.runFor(6*60_000);expect(server.writes).toHaveLength(2);
});
test('Korean midnight opens a new day independently of the previous five-minute receipt',async({page})=>{
 const server=await backend(page);await page.clock.install({time:new Date('2026-09-28T14:59:00Z')});await page.goto('/member-visits-test?recorder');await expect.poll(()=>server.writes.length).toBe(1);await page.clock.runFor(60_000);await expect.poll(()=>server.writes.length).toBe(2);
});
