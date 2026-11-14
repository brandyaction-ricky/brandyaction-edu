import {test,expect,type Page} from '@playwright/test';
import {student} from '../campus-fixture/data';
import {defaultProfile} from '../../features/campus/space/domain';
const eid=student.selectedEnrollmentId!,cohort=student.scopes[0].cohortId;
async function setup(page:Page){
 await page.route('**/campus/world/tour/index.html*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><button id="save">검수용 캐릭터 저장</button><script>const token=new URLSearchParams(location.hash.slice(1)).get('bridge');const send=(type,payload)=>parent.postMessage({source:'moonshot-tour',token,type,payload},location.origin);window.addEventListener('message',e=>{if(e.data.type==='init')send('ready',{});});document.querySelector('#save').onclick=()=>send('appearance-save',{nickname:'서버에 저장한 동료',gender:'female',model:2,coat:'#123456'});send('ready',{});</script>`}));
 await page.route('**/api/campus/community/rewards?**',r=>r.fulfill({json:{level:3,xp:100}}));
}
async function room(page:Page,name='문샷 공부방'){await page.getByRole('button',{name:name+' 입장',exact:true}).click();if(name==='내 AI 사무실'){const guide=page.getByRole('dialog',{name:'개인 사무실 이용 안내',exact:true});await expect(guide).toBeVisible();await guide.getByRole('button',{name:'개인 사무실 이용 안내 닫기',exact:true}).click();}}
async function task(page:Page,title:string){await page.getByRole('button',{name:'이 공간에서 할 일',exact:true}).click();await page.getByRole('region',{name:'이 공간에서 할 일',exact:true}).getByRole('button',{name:title,exact:true}).click();}
test('authenticated tour uses account profile and preserves private fields on avatar save',async({page})=>{
 await setup(page);let stored={...defaultProfile('서버 동료'),note:'개인 메모 보존',desk:'내 책상'};const writes:Record<string,unknown>[]=[];
 await page.route('**/api/campus/space**',r=>{if(r.request().method()==='POST'){const b=r.request().postDataJSON();writes.push(b);stored=b.profile;}return r.fulfill({json:{profile:stored,peers:[],messages:[],seats:[],serverNow:new Date().toISOString()}});});
 await page.goto('/campus/workspace?tourLive=1&enrollmentId='+eid);await expect(page.getByLabel('지도에서 권한 체험')).toHaveCount(0);await room(page);await expect(page.getByRole('button',{name:'내 캐릭터',exact:true})).toBeEnabled();await page.frameLocator('iframe').getByRole('button',{name:'검수용 캐릭터 저장'}).click();await expect(page.getByRole('status').filter({hasText:'내 계정에 저장'})).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0]).toMatchObject({kind:'profile',cohortId:cohort,profile:{nickname:'서버에 저장한 동료',note:'개인 메모 보존',desk:'내 책상'}});await page.reload();await room(page);await expect(page.getByRole('button',{name:'내 캐릭터',exact:true})).toBeEnabled();expect(await page.evaluate(()=>localStorage.getItem('moonshot-tour-avatar-v1'))).toBeNull();
});
test('revoked membership cannot keep a usable room or claim avatar success',async({page})=>{
 await setup(page);let deny=false;await page.route('**/api/campus/space**',r=>deny?r.fulfill({status:403,json:{error:'수강권이 종료되었습니다.'}}):r.fulfill({json:{profile:defaultProfile('동료'),peers:[],messages:[],seats:[]}}));await page.goto('/campus/workspace?tourLive=1&enrollmentId='+eid);await room(page);await expect(page.getByRole('button',{name:'내 캐릭터',exact:true})).toBeEnabled();deny=true;await page.frameLocator('iframe').getByRole('button',{name:'검수용 캐릭터 저장'}).click();await expect(page.getByRole('heading',{name:'수강권을 다시 확인해 주세요'})).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByText(/내 계정에 저장했어요/)).toHaveCount(0);
});
test('real lesson opening rechecks membership and keeps a campus return route',async({page})=>{
 await setup(page);await page.route('**/api/campus/space**',r=>r.fulfill({json:{profile:defaultProfile('동료'),peers:[],messages:[],seats:[]}}));let reads=0;await page.route('**/api/campus?**',r=>{reads++;return r.fulfill({json:student});});await page.goto('/campus/workspace?tourLive=1&enrollmentId='+eid);await room(page);await task(page,'수업·과제');await page.getByRole('combobox',{name:'수업 선택'}).selectOption(student.lessons[4].id);await page.getByRole('button',{name:/^수업 (열기|다시 보기)$/}).click();await expect(page).toHaveURL(/\/learn\//);expect(reads).toBe(2);await expect(page.getByRole('link',{name:'← 캠퍼스로 돌아가기'})).toHaveAttribute('href',/enrollmentId=/);
});
test('business record uses the authenticated API and reopens from server data',async({page})=>{
 await setup(page);await page.route('**/api/campus/space**',r=>r.fulfill({json:{profile:defaultProfile('동료'),peers:[],messages:[],seats:[]}}));let records:Record<string,unknown>[]=[];const writes:Record<string,unknown>[]=[];
 await page.route('**/api/campus/business**',r=>{if(r.request().method()==='POST'){const b=r.request().postDataJSON();writes.push(b);const record={...b,user_id:student.viewer.id,enrollment_id:eid,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null};records=[record];return r.fulfill({json:{record}});}return r.fulfill({json:{records,nextCursor:null,links:[],replies:[],cases:[]}});});
 await page.goto('/campus/workspace?tourLive=1&enrollmentId='+eid);await room(page,'내 AI 사무실');await task(page,'내 사업 계획');const form=page.getByRole('form',{name:'내 사업 계획 작성'});await form.getByLabel('기록 제목').fill('DEV 연결 계획');await form.getByLabel('상품·서비스').fill('QA 상담');await form.getByLabel('핵심 고객').fill('QA 고객');await form.getByLabel('고객이 해결하고 싶은 문제').fill('입장 흐름 검수');await form.getByLabel('판매 가격').fill('1000');await form.getByRole('button',{name:'내 기록에 저장',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0].enrollmentId).toBe(eid);await expect(page.getByRole('status').filter({hasText:'내 비공개 기록에 저장했어요.'})).toBeVisible();await page.getByRole('button',{name:'내 사업 계획 닫기',exact:true}).click();await task(page,'내 사업 계획');await expect(page.getByText('DEV 연결 계획',{exact:true})).toBeVisible();expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('moonshot-business-demo')))).toBe(false);
});

test('office result remains openable after first desks paint and before the room is ready',async({page})=>{
 await setup(page);
 await page.route('**/api/campus/library**',r=>r.fulfill({json:{resources:[]}}));
 const job={id:'80000000-0000-4000-8000-000000000001',employee_id:'writer',objective:'첫 수업 공지 작성',status:'review',revision:4,draft_text:'수강생에게 보낼 실제 공지 본문',material_urls:[],output_type:'copy',updated_at:'2026-11-12T00:00:00Z'};
 await page.route('**/campus/world/tour/index.html*',r=>r.fulfill({contentType:'text/html',body:`<button>책상만 표시</button><script>const token=new URLSearchParams(location.hash.slice(1)).get('bridge');document.querySelector('button').onclick=()=>parent.postMessage({source:'moonshot-tour',token,type:'office-desks-visible',payload:{visible:true}},location.origin)</script>`}));
 await page.route('**/api/campus/space**',r=>r.fulfill({json:{profile:defaultProfile('동료'),peers:[],messages:[],seats:[]}}));
 await page.route('**/api/campus/office/agents?**',r=>r.fulfill({json:{document:{profiles:[{employeeId:'writer',name:'공지 직원'}]},desks:[{employeeId:'writer',jobId:job.id,status:'review'}],employees:[],next:null}}));
 await page.route('**/api/campus/office?**',r=>r.fulfill({json:{jobs:[job],detail:new URL(r.request().url()).searchParams.get('job')===job.id?job:null,history:[],connection:'incoming_adapter_registered'}}));
 await page.goto('/campus/workspace?tourLive=1&enrollmentId='+eid);await room(page,'내 AI 사무실');
 const result=page.getByRole('region',{name:'직원 업무'}).getByRole('button',{name:'공지 직원 · 검토할 결과 업무 열기'});
 await expect(result).toBeVisible();
 await page.frameLocator('iframe').getByRole('button',{name:'책상만 표시'}).click();
 await expect(page.getByRole('button',{name:'공간 전체 보기',exact:true})).toBeDisabled();
 await result.click();await expect(page.getByRole('article',{name:'선택한 AI 직원 작업'})).toContainText(job.draft_text);
});
test('a browser without 3D shows the office as a flat seat list with Korean guidance and opens results from it',async({page})=>{
 await setup(page);
 await page.route('**/api/campus/library**',r=>r.fulfill({json:{resources:[]}}));
 const job={id:'80000000-0000-4000-8000-000000000002',employee_id:'writer',objective:'첫 수업 공지 작성',status:'review',revision:4,draft_text:'3D 없이도 열리는 결과 본문',material_urls:[],output_type:'copy',updated_at:'2026-11-12T00:00:00Z'};
 await page.route('**/campus/world/tour/index.html*',r=>r.fulfill({contentType:'text/html',body:`<script>const token=new URLSearchParams(location.hash.slice(1)).get('bridge');window.addEventListener('message',e=>{if(e.data.type==='init')parent.postMessage({source:'moonshot-tour',token,type:'error',payload:{}},location.origin);});</script>`}));
 await page.route('**/api/campus/space**',r=>r.fulfill({json:{profile:defaultProfile('동료'),peers:[],messages:[],seats:[]}}));
 await page.route('**/api/campus/office/agents?**',r=>r.fulfill({json:{document:{profiles:[{employeeId:'lead',name:'총괄 관리자',seatIndex:0},{employeeId:'writer',name:'공지 직원',seatIndex:1}]},desks:[{employeeId:'writer',jobId:job.id,status:'review'}],employees:[],next:null}}));
 await page.route('**/api/campus/office?**',r=>r.fulfill({json:{jobs:[job],detail:new URL(r.request().url()).searchParams.get('job')===job.id?job:null,history:[],connection:'incoming_adapter_registered'}}));
 await page.goto('/campus/workspace?tourLive=1&enrollmentId='+eid);await room(page,'내 AI 사무실');
 const flat=page.getByRole('region',{name:'사무실 간단히 보기'});await expect(flat).toBeVisible();
 await expect(flat).toContainText('3D 화면을 열 수 없어 간단한 화면으로 보여드려요');await expect(flat).toContainText('그래픽 가속 사용');
 const seats=flat.getByRole('listitem');await expect(seats).toHaveCount(10);await expect(seats.nth(0)).toContainText('총괄 관리자 자리');await expect(seats.nth(0)).toContainText('대기 중');await expect(seats.nth(2)).toContainText('빈자리');
 await expect(page.getByRole('button',{name:'공간 전체 보기',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'내 캐릭터',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'직원 업무'})).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath('flat-office.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await seats.nth(1).getByRole('button',{name:'공지 직원 · 검토할 결과 업무 열기'}).click();
 await expect(page.getByRole('article',{name:'선택한 AI 직원 작업'})).toContainText('3D 없이도 열리는 결과 본문');
});
test('live job inbox names the employee, titles the result by the task and points revisions back to Telegram',async({page})=>{
 await setup(page);
 await page.route('**/api/campus/library**',r=>r.fulfill({json:{resources:[]}}));
 const job={id:'80000000-0000-4000-8000-000000000003',employee_id:'writer',objective:'첫 수업 공지 작성',status:'revision_requested',revision:5,draft_text:'# 공지\n**목요일** 저녁 8시\n- 링크는 당일 발송',review_note:'시간을 9시로 고쳐 주세요.',material_urls:[],output_type:'copy',updated_at:'2026-11-12T00:00:00Z'};
 const writer={employeeId:'writer',name:'공지 직원',telegramUrl:'https://t.me/moonshot_notice_bot',duties:'',appearanceSeed:1,seatIndex:1};
 await page.route('**/api/campus/space**',r=>r.fulfill({json:{profile:defaultProfile('동료'),peers:[],messages:[],seats:[]}}));
 await page.route('**/api/campus/office/agents?**',r=>r.fulfill({json:{document:{profiles:[writer]},desks:[],employees:[writer],next:null}}));
 await page.route('**/api/campus/office?**',r=>r.fulfill({json:{jobs:[job],detail:new URL(r.request().url()).searchParams.get('job')===job.id?job:null,history:[],connection:'incoming_adapter_registered'}}));
 await page.goto('/campus/workspace?tourLive=1&enrollmentId='+eid);await room(page,'내 AI 사무실');await task(page,'업무 관리');
 await expect(page.getByRole('heading',{name:'새 작업 요청'})).toHaveCount(0);
 const card=page.getByRole('button',{name:/첫 수업 공지 작성/});await expect(card).toContainText('공지 직원 · 문구 초안');await card.click();
 const detail=page.getByRole('article',{name:'선택한 AI 직원 작업'});await expect(detail.getByRole('heading',{name:'첫 수업 공지 작성'})).toBeVisible();await expect(detail).toBeInViewport();
 await expect(detail).toContainText('수정을 요청한 초안');await expect(detail).toContainText('공지\n목요일 저녁 8시\n• 링크는 당일 발송');await expect(detail).not.toContainText('**');
 await expect(detail.getByRole('link',{name:'텔레그램에서 이어서 맡기기 ↗'})).toHaveAttribute('href','https://t.me/moonshot_notice_bot');
 await expect(page.getByRole('navigation',{name:'업무 페이지'})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
