import {expect,test,type Page} from '@playwright/test';
import type {LessonBlockAnswers,LessonBlockDocument} from '../../lib/lesson-blocks';
const revision='44444444-4444-4444-8444-444444444444';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const document:LessonBlockDocument={schemaVersion:1,blocks:[{id:'proof',type:'question',question:{label:'실행 증빙',kind:'image',required:true}},{id:'archive',type:'question',question:{label:'결과물 묶음',kind:'file',required:false}},{id:'memo',type:'question',question:{label:'내 설명',kind:'text',required:false}}],checklist:[],completion:{mode:'mentor',requireAnswers:true,requireQuizPass:false}};
async function backend(page:Page,{delay=false,lost=false,legacy=false}={}){
 let draft:{writeId:string;values:LessonBlockAnswers;updatedAt:string}|null=null,submission:Record<string,unknown>|null=null;
 if(legacy)draft={writeId:revision,values:{blocks:{proof:{imageId:'11111111-1111-4111-8111-111111111111',fileId:'22222222-2222-4222-8222-222222222222'}},checklist:[]},updatedAt:new Date().toISOString()};
 const prepared:Record<string,unknown>[]=[],fileRows=new Map<string,{id:string;name:string;kind:string;size:number;ready:boolean}>(),writes:Record<string,unknown>[]=[];let release=()=>{};
 const wait=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/platform/lesson-files**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({contentType:'image/png',body:png});return;}
  const body=route.request().postDataJSON();
  if(body.action==='prepare'){prepared.push(body);let row=fileRows.get(body.requestId);if(!row){row={id:body.requestId,name:body.name,kind:body.kind,size:body.size,ready:false};fileRows.set(row.id,row);}await route.fulfill({json:{...row,signedUrl:'https://storage.test/upload/'+row.id,contentType:row.kind==='image'?'image/png':'application/zip'}});return;}
  if(delay)await wait;
  const row=fileRows.get(body.fileId)!;row.ready=true;
  if(lost){lost=false;await route.fulfill({status:503,json:{error:'파일 확인 응답을 받지 못했습니다.'}});return;}await route.fulfill({json:row});
 });
 await page.route('https://storage.test/upload/**',route=>{expect(route.request().method()).toBe('PUT');expect(route.request().headers()['x-upsert']).toBe('false');expect(route.request().headers()['cookie']).toBeUndefined();return route.fulfill({json:{Key:'stored'}});});
 await page.route('**/api/platform/lesson-blocks**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:{document,revision,currentRevision:revision,draft,submission,previousDrafts:[],editable:true}});return;}
  const body=route.request().postDataJSON();if(body.action==='draft'){writes.push(body);draft={writeId:body.requestId,values:body.values,updatedAt:new Date().toISOString()};await route.fulfill({json:draft});return;}
  expect(body.action).toBe('submit');submission={id:body.requestId,stateId:body.requestId,revision,writeId:body.writeId,outcome:'submitted',state:'submitted',createdAt:new Date().toISOString()};await route.fulfill({json:submission});
 });
 return{prepared,writes,release,draft:()=>draft};
}
test('each question offers only its configured file type and preserves uploads, concurrent text and submission',async({page},info)=>{
 const server=await backend(page,{delay:true});await page.goto('/lesson-blocks-test');await page.getByRole('button',{name:'미션 제출하기'}).click();await expect(page.getByRole('alert')).toContainText('실행 증빙');
 await expect(page.getByRole('region',{name:'실행 증빙',exact:true}).locator('input[type=file]')).toHaveCount(1);await expect(page.getByRole('region',{name:'실행 증빙',exact:true}).getByLabel('압축파일 선택')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'결과물 묶음',exact:true}).locator('input[type=file]')).toHaveCount(1);await expect(page.getByRole('region',{name:'결과물 묶음',exact:true}).getByLabel('답변 이미지 선택')).toHaveCount(0);
 await page.getByLabel('답변 이미지 선택').setInputFiles({name:'실행.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('status').filter({hasText:'첨부파일을 올리고'})).toBeVisible();await expect(page.getByRole('button',{name:'미션 제출하기'})).toBeDisabled();
 await page.getByRole('textbox',{name:'내 설명'}).fill('업로드 중에 적은 설명');server.release();await expect(page.getByRole('link',{name:'첨부 이미지 열기'})).toBeVisible();
 await page.getByLabel('압축파일 선택').setInputFiles({name:'증빙.zip',mimeType:'application/zip',buffer:Buffer.from([80,75,3,4,0,0])});await expect(page.getByRole('link',{name:'압축파일 다운로드'})).toBeVisible();await page.getByRole('button',{name:'미션 제출하기'}).click();await expect(page.getByText('미션을 제출했습니다. 멘토의 확인을 기다려 주세요.',{exact:true})).toBeVisible();
 expect(server.draft()?.values.blocks.memo).toBe('업로드 중에 적은 설명');expect(Object.keys(server.draft()!.values.blocks.proof)).toEqual(['imageId']);expect(Object.keys(server.draft()!.values.blocks.archive)).toEqual(['fileId']);expect(JSON.stringify(server.draft())).not.toMatch(/storage.test|signedUrl|token|증빙.zip/);
 await page.reload();await expect(page.getByRole('link',{name:'첨부 이미지 열기'})).toBeVisible();await expect(page.getByRole('link',{name:'압축파일 다운로드'})).toBeVisible();await expect(page.getByLabel('답변 이미지 선택')).toHaveCount(0);
 expect(await page.evaluate(()=>window.document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('submitted-files.png'),fullPage:true});
});
test('older image answers keep their archive download through saving and submission without a second upload field',async({page})=>{
 const server=await backend(page,{legacy:true});await page.goto('/lesson-blocks-test');const proof=page.getByRole('region',{name:'실행 증빙',exact:true});
 await expect(proof.getByRole('link',{name:'첨부 이미지 열기'})).toBeVisible();await expect(proof.getByRole('link',{name:'압축파일 다운로드'})).toBeVisible();await expect(proof.getByLabel('답변 이미지 선택')).toBeEnabled();await expect(proof.getByLabel('압축파일 선택')).toHaveCount(0);
 await page.getByRole('textbox',{name:'내 설명'}).fill('기존 첨부 보존');await page.getByRole('button',{name:'미션 제출하기'}).click();await expect(page.getByText('미션을 제출했습니다. 멘토의 확인을 기다려 주세요.',{exact:true})).toBeVisible();
 expect(server.draft()?.values.blocks.proof).toEqual({imageId:'11111111-1111-4111-8111-111111111111',fileId:'22222222-2222-4222-8222-222222222222'});await page.reload();await expect(proof.getByRole('link',{name:'압축파일 다운로드'})).toBeVisible();await expect(proof.locator('input[type=file]')).toHaveCount(0);
});
test('lost file confirmation retries its exact request ID and removal changes only that slot',async({page})=>{
 const server=await backend(page,{lost:true});await page.goto('/lesson-blocks-test');await page.getByLabel('답변 이미지 선택').setInputFiles({name:'실행.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('alert')).toContainText('파일 확인 응답');expect(server.draft()?.values.blocks.proof).toBeUndefined();
 await page.getByRole('button',{name:'첨부 다시 시도'}).click();await expect(page.getByRole('link',{name:'첨부 이미지 열기'})).toBeVisible();expect(server.prepared[1]).toEqual(server.prepared[0]);
 await page.getByRole('textbox',{name:'내 설명'}).fill('남아야 하는 설명');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'이미지 빼기'}).click();await expect(page.getByRole('link',{name:'첨부 이미지 열기'})).toHaveCount(0);await expect.poll(()=>server.draft()?.values.blocks.memo).toBe('남아야 하는 설명');await expect.poll(()=>server.draft()?.values.blocks.proof).toEqual({});
});
test('invalid files never request upload permission and pending uploads warn before navigation',async({page})=>{
 const server=await backend(page,{delay:true});await page.goto('/lesson-blocks-test');await page.getByLabel('답변 이미지 선택').setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.getByRole('alert')).toContainText('JPG');expect(server.prepared).toHaveLength(0);
 await page.getByLabel('답변 이미지 선택').setInputFiles({name:'실행.png',mimeType:'image/png',buffer:png});await expect(page.getByRole('button',{name:'미션 제출하기'})).toBeDisabled();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'내 클래스로 이동'}).click();expect(new URL(page.url()).pathname).toBe('/lesson-blocks-test');server.release();await expect(page.getByRole('link',{name:'첨부 이미지 열기'})).toBeVisible();
});
