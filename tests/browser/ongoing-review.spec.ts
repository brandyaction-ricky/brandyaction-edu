import {test,expect,type Page} from '@playwright/test';
import {type LessonBlockDocument,publicLessonBlocks} from '../../lib/lesson-blocks';
const uid=(n:number)=>`aaaaaaaa-1111-4111-8111-${String(n).padStart(12,'0')}`;
const period='2026-09-28T15:00:00.000Z',end='2026-09-29T15:00:00.000Z';
const document:LessonBlockDocument={schemaVersion:1,blocks:[{id:'q',type:'question',question:{label:'오늘의 실행',kind:'text',required:false}},{id:'image',type:'image',assetId:uid(4)},{id:'proof',type:'question',question:{label:'실행 증빙',kind:'image',required:false}},{id:'generator',type:'prompt-generator',content:'계획: {주제}',fields:[{id:'topic',label:'주제',variable:'주제',required:false,sensitive:false,placeholder:''}]}],checklist:[{id:'c',label:'실행 확인',required:true}],completion:{mode:'self',requireAnswers:false,requireQuizPass:false}};
const row=(i:number)=>({enrollmentId:uid(i+10),lessonId:uid(1),periodStart:period,periodEnd:end,memberName:`시험 회원 ${i}`,courseTitle:'시험 과정',lessonTitle:'매일 실습',cadence:'daily',completedAt:i===1?period:null,updatedAt:period,enrollmentStatus:'active'});
async function backend(page:Page,options:{failList?:boolean;failDetail?:boolean;delay?:Promise<void>;empty?:boolean}={}){
 const queries:URLSearchParams[]=[];const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await page.route('**/api/admin/ongoing-lessons**',async route=>{
  expect(route.request().method()).toBe('GET');const q=new URL(route.request().url()).searchParams;queries.push(q);
  if(q.get('action')==='file'){await route.fulfill({contentType:'image/png',body:png});return;}
  if(q.get('action')==='options'){await route.fulfill({json:{lessons:[{id:uid(1),title:'매일 실습',courseTitle:'시험 과정',cadence:'daily',archived:false}]}});return;}
  if(q.get('action')==='list'){
   if(options.failList){options.failList=false;await route.fulfill({status:503,json:{error:'목록 연결 실패'}});return;}
   const p=Number(q.get('page'));await route.fulfill({json:{rows:options.empty?[]:p===1?[row(1),row(2)]:[row(3)],total:options.empty?0:21,page:p,pageSize:20}});return;
  }
  if(options.failDetail){options.failDetail=false;await route.fulfill({status:503,json:{error:'답변 연결 실패'}});return;}
  const n=q.get('enrollment')===uid(11)?1:2;
  if(n===1&&options.delay)await options.delay;
  const completed=q.get('snapshot')==='completed';
  await route.fulfill({json:{...row(n),revision:uid(3),snapshot:completed?'completed':'latest',document:publicLessonBlocks(document),values:{blocks:{q:`회원 ${n} ${completed?'완료 당시':'마지막 저장'}`,generator:{topic:completed?'이전 주제':'현재 주제'},proof:{imageId:uid(completed?6:5)}},checklist:['c']}}});
 });return queries;
}
test('reviewer reads latest or immutable completed values with period-bound media URLs and no editable controls',async({page},info)=>{
 const queries=await backend(page);await page.goto('/ongoing-review-test');await page.getByRole('button',{name:/시험 회원 1/}).click();
 await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('회원 1 마지막 저장');await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveAttribute('readonly','');await expect(page.locator('.lb-prompt pre')).toHaveText('계획: 현재 주제');
 await page.getByRole('button',{name:'완료 당시 답변',exact:true}).click();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('회원 1 완료 당시');await expect(page.locator('.lb-prompt pre')).toHaveText('계획: 이전 주제');
 const href=await page.getByRole('link',{name:'첨부 이미지 열기'}).getAttribute('href'),q=new URL(href!,'https://edu.test').searchParams;expect(q.get('period')).toBe(period);expect(q.get('snapshot')).toBe('completed');expect(q.get('enrollment')).toBe(uid(11));expect(q.get('file')).toBe(uid(6));
 expect(await page.locator('img').count()).toBe(2);await expect.poll(()=>queries.some(q=>q.get('kind')==='content'&&q.get('snapshot')==='completed')).toBe(true);
 await expect(page.locator('input[type=file]')).toHaveCount(0);await expect(page.getByRole('button',{name:'이번 기간 챌린지 완료'})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:'실행 확인'})).toBeDisabled();
 expect(await page.evaluate(()=>window.document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const panel=await page.getByRole('region',{name:'지속 챌린지 참여 기록',exact:true}).boundingBox(),item=await page.getByRole('button',{name:/시험 회원 1/}).boundingBox();expect(item!.x+item!.width).toBeLessThanOrEqual(panel!.x+panel!.width+1);
 await page.screenshot({path:info.outputPath('ongoing-review.png'),fullPage:true});
});
test('filters and pages keep the selected record separate and clear stale detail',async({page})=>{
 const queries=await backend(page);await page.goto('/ongoing-review-test');await page.getByRole('button',{name:/시험 회원 1/}).click();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toBeVisible();
 await page.getByRole('combobox',{name:'조회 기간'}).selectOption('all');await expect(page.getByRole('region',{name:'선택한 챌린지 답변'})).toHaveCount(0);
 await page.getByRole('combobox',{name:'완료 상태'}).selectOption('draft');await page.getByRole('combobox',{name:'챌린지',exact:true}).selectOption(uid(1));
 await page.getByRole('button',{name:'다음 페이지'}).click();await expect(page.getByText('기간별 참여 기록 21건 · 2페이지')).toBeVisible();await expect(page.getByRole('button',{name:/시험 회원 3/})).toBeVisible();
 const q=queries.filter(q=>q.get('action')==='list').at(-1)!;expect(Object.fromEntries(q)).toMatchObject({scope:'all',state:'draft',lesson:uid(1),page:'2'});
 await page.getByRole('combobox',{name:'완료 상태'}).selectOption('completed');await expect(page.getByText('기간별 참여 기록 21건 · 1페이지')).toBeVisible();
});
test('failed list and detail offer independent retries without showing success or another record',async({page})=>{
 await backend(page,{failList:true,failDetail:true});await page.goto('/ongoing-review-test');await expect(page.getByRole('alert')).toHaveText('목록 연결 실패');
 await page.getByRole('button',{name:'참여 목록 새로고침'}).click();await page.getByRole('button',{name:/시험 회원 1/}).click();await expect(page.getByRole('alert')).toHaveText('답변 연결 실패');await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveCount(0);
 await page.getByRole('button',{name:'답변 다시 확인'}).click();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('회원 1 마지막 저장');
});
test('a delayed previous selection never overwrites the newly selected member',async({page})=>{
 let release!:()=>void;const delayed=new Promise<void>(resolve=>{release=resolve;});const queries=await backend(page,{delay:delayed});await page.goto('/ongoing-review-test');
 await page.getByRole('button',{name:/시험 회원 1/}).click();await expect.poll(()=>queries.some(q=>q.get('action')==='detail'&&q.get('enrollment')===uid(11))).toBe(true);
 await page.getByRole('button',{name:/시험 회원 2/}).click();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('회원 2 마지막 저장');release();
 await expect(page.getByRole('button',{name:'완료 당시 답변',exact:true})).toBeDisabled();await page.getByRole('button',{name:'답변 다시 확인'}).click();await expect(page.getByRole('textbox',{name:'오늘의 실행'})).toHaveValue('회원 2 마지막 저장');
});
test('empty filters show an empty state with no detail or next page',async({page})=>{
 await backend(page,{empty:true});await page.goto('/ongoing-review-test');await expect(page.getByText('이 조건에 맞는 참여 기록이 없습니다.')).toBeVisible();await expect(page.getByRole('button',{name:'다음 페이지'})).toBeDisabled();await expect(page.getByRole('region',{name:'선택한 챌린지 답변'})).toHaveCount(0);
});
