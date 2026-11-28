import {expect, test} from '@playwright/test';
import {GET as getScene} from '../../app/experience/study-walk/scene/route';
import {student} from '../campus-fixture/data';

test('seating opens the first unfinished lesson and Back protects a hidden question', async ({page})=>{
 await page.goto('/lunar-room-fixture?seated=1');
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:student.lessons.find(l=>!l.completed)!.title})).toBeVisible();
 await dialog.getByRole('button',{name:/닫기/}).first().click();
 const dock=page.getByLabel('공간 바로가기');
 async function openQuestions(){
  await expect(dock.getByRole('button',{name:'수업 열기',exact:true})).toBeVisible();
  await expect(dock.getByRole('button',{name:'자료·다시보기'})).toHaveCount(0);
  await expect(dock.locator('details')).toHaveJSProperty('open',false);
  await dock.getByRole('button',{name:'이 공간에서 할 일'}).click();
  await page.getByRole('region',{name:'이 공간에서 할 일'}).getByRole('button',{name:/AI 조교·멘토/}).click();
 }
 await openQuestions();
 await dialog.locator('textarea').fill('다음 수업을 위해 남긴 질문');
 await dialog.getByRole('button',{name:/닫기/}).first().click();
 async function leave(discard:boolean){
  const confirmation=page.waitForEvent('dialog');
  await page.evaluate(()=>history.back());
  const prompt=await confirmation;
  expect(prompt.type()).toBe('confirm');
  if(discard)await prompt.accept();else await prompt.dismiss();
 }
 await leave(false);
 await openQuestions();
 await expect(dialog.locator('textarea')).toHaveValue('다음 수업을 위해 남긴 질문');
 await dialog.getByRole('button',{name:/닫기/}).first().click();
 await leave(true);
 await expect(page.getByRole('heading',{name:'캠퍼스 문 앞'})).toBeVisible();
});

test('a choice made before the walking code loads still works when the module fails',async({page})=>{
 let release!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/lunar-scene-fixture',async route=>{
  await route.fulfill({contentType:'text/html',body:await getScene().text()});
 });
 await page.route('**/tour/study-walk.mjs',async route=>{await waiting;await route.abort();});
 await page.goto('/lunar-scene-fixture',{waitUntil:'commit'});
 await page.getByRole('button',{name:/공부방/}).click();
 await expect(page.getByRole('status')).toContainText('공부방');
 await page.getByRole('button',{name:/내 AI 사무실/}).click();
 await expect(page.getByRole('status')).toContainText('사무실');
 release();
 await expect(page.getByRole('status')).toContainText('바로 들어가세요');
 const arrival=page.evaluate(()=>new Promise(resolve=>{
  window.addEventListener('message',event=>resolve(event.data),{once:true});
 }));
 await page.getByRole('button',{name:'바로 입장'}).click();
 expect(await arrival).toMatchObject({type:'moonshot-lobby-arrived',room:'office'});
});


test('the lobby is walkable while its decorative textures are unavailable', async ({page})=>{
 let release!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/lunar-scene-fixture',async route=>{
  await route.fulfill({contentType:'text/html',body:await getScene().text()});
 });
 await page.route(/(?:lunar-concourse-floor|study-lunar-horizon)\.webp$/,async route=>{
  await hold;
  await route.abort();
 });
 try {
  await page.goto('/lunar-scene-fixture',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:/공부방/}).click();
  await expect(page.locator('#walk-scene')).toHaveAttribute('data-route','study');
  await expect(page.getByRole('button',{name:'멈추기'})).toBeVisible();
 } finally {release();}
});
