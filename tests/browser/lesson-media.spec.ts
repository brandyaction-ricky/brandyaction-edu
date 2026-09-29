import { detailedAuthor } from './helpers/detailed-author';
import { expect, test, type Page } from '@playwright/test';

// Existing field-level regressions exercise the retained detailed settings.
test.beforeEach(async ({ page }) => detailedAuthor(page));
import type { LessonBlockDocument } from '../../lib/lesson-blocks';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYFkAAAAASUVORK5CYII=','base64');
async function backend(page:Page,failComplete=false){
 let document:LessonBlockDocument|null=null,revision:string|null=null,release=()=>{},hold=false;
 const prepared:{requestId:string;courseId:string;kind:string}[]=[],complete:string[]=[],putHeaders:Record<string,string>[]=[];
 await page.route('**/api/platform/lesson-blocks**',async route=>{
  if(route.request().method()==='POST'){const body=route.request().postDataJSON();document=body.document;revision=body.requestId;await route.fulfill({json:{revision}});return;}
  if(new URL(route.request().url()).searchParams.get('action')==='progression'){await route.fulfill({json:{lessons:[{lessonId:'aaaaaaab-1111-4111-8111-000000000004',isUnlocked:true,track:null}]}});return;}
  await route.fulfill({json:{document,revision,currentRevision:revision,editable:!new URL(route.request().url()).searchParams.has('enrollment'),draft:null,previousDrafts:[]}});
 });
 await page.route('**/api/platform/lesson-media**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({contentType:'image/png',body:png});return;}
  const body=route.request().postDataJSON();
  if(body.action==='prepare'){prepared.push(body);await route.fulfill({json:{id:body.requestId,contentType:body.contentType,signedUrl:'https://upload.example.test/'+body.requestId}});return;}
  complete.push(body.assetId);if(hold)await new Promise<void>(resolve=>{release=resolve;});
  if(failComplete){failComplete=false;await route.fulfill({status:503,json:{error:'합성 업로드 응답 오류'}});return;}
  await route.fulfill({json:{id:body.assetId}});
 });
 await page.route('https://upload.example.test/**',async route=>{putHeaders.push(route.request().headers());await route.fulfill({json:{ok:true}});});
 return {prepared,complete,putHeaders,getDocument:()=>document,hold:()=>{hold=true;},release:()=>{hold=false;release();}};
}
async function add(page:Page,kind:string){await page.getByRole('combobox',{name:'추가할 항목'}).selectOption(kind);await page.getByRole('button',{name:'항목 추가',exact:true}).click();return page.locator('[data-author-block]').last();}
test('author uploads image/audio/video, blocks save while pending, and student reload uses course-authorized stable media URLs',async({page},info)=>{
 const api=await backend(page);await page.goto('/lesson-block-author-test');await page.getByRole('button',{name:'여러 항목으로 구성하기'}).click();
 for(const [kind,label,name,mime,buffer] of [['image','이미지','image.png','image/png',png],['audio','음성','audio.mp3','audio/mpeg',Buffer.from('ID3synthetic')],['video','영상','video.mp4','video/mp4',Buffer.from('0000ftypisom0000')]] as const){
  const block=await add(page,kind);api.hold();await block.getByLabel(label+' 파일 선택',{exact:true}).setInputFiles({name,mimeType:mime,buffer});
  await expect(page.getByRole('button',{name:'파일 업로드 중…',exact:true})).toBeDisabled();await expect.poll(()=>api.complete.length > 0 && api.complete.length===api.prepared.length).toBe(true);
  api.release();await expect(block.getByText('파일을 연결했습니다. 학습 저장을 누르면 반영됩니다.')).toBeVisible();await expect(block.getByRole('textbox',{name:'주소'})).toHaveCount(0);
 }
 await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.',{exact:true})).toBeVisible();
 expect(api.prepared.every(item=>item.courseId==='aaaaaaab-1111-4111-8111-000000000002')).toBe(true);expect(api.putHeaders.every(item=>item['x-upsert']==='false')).toBe(true);
 const blocks=api.getDocument()!.blocks.slice(1);expect(blocks.map(b=>b.type)).toEqual(['image','audio','video']);expect(blocks.every(b=>b.assetId&&!b.url)).toBe(true);
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByRole('link',{name:'연결된 이미지 열기'})).toBeVisible();
 await page.getByRole('button',{name:'학생 화면 보기'}).click();
 for(const kind of ['image','audio','video']){const tag=kind==='image'?'img':kind,el=page.locator('.lesson-blocks '+tag);await expect(el).toHaveAttribute('src',/\/api\/platform\/lesson-media\?asset=.*&lesson=.*&enrollment=.*&revision=/);}
 await expect(page.locator('.lesson-blocks img')).toBeVisible();await page.screenshot({path:info.outputPath('student-private-media.png'),fullPage:true});
});
test('lost completion response retries the same immutable file and does not save an unverified asset',async({page})=>{
 const api=await backend(page,true);await page.goto('/lesson-block-author-test');await page.getByRole('button',{name:'여러 항목으로 구성하기'}).click();const block=await add(page,'image');
 await block.getByLabel('이미지 파일 선택',{exact:true}).setInputFiles({name:'image.png',mimeType:'image/png',buffer:png});await expect(block.getByRole('alert')).toContainText('합성 업로드 응답 오류');
 await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect(page.getByLabel('기본 정보 저장 횟수')).toHaveText('0');
 await block.getByRole('button',{name:'같은 파일 다시 올리기'}).click();await expect(block.getByRole('link',{name:'연결된 이미지 열기'})).toBeVisible();expect(api.prepared[0].requestId).toBe(api.prepared[1].requestId);
 await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect.poll(()=>api.getDocument()?.blocks[1].assetId).toBe(api.prepared[0].requestId);
});
test('new lesson accepts clipboard image after week selection without a preliminary metadata save',async({page})=>{
 const api=await backend(page);await page.goto('/lesson-block-author-test?new');await page.getByRole('button',{name:'여러 항목으로 구성하기'}).click();const block=await add(page,'image');
 await expect(block.getByLabel('이미지 파일 선택',{exact:true})).toBeDisabled();await page.getByRole('combobox',{name:'주차 (Week)'}).selectOption('aaaaaaab-1111-4111-8111-000000000005');
 await block.getByLabel('이미지 파일 등록',{exact:true}).evaluate((element,bytes)=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(bytes)],'붙여넣기.png',{type:'image/png'}));element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},Array.from(png));
 await expect(block.getByRole('link',{name:'연결된 이미지 열기'})).toBeVisible();expect(api.prepared).toHaveLength(1);await expect(page.getByLabel('기본 정보 저장 횟수')).toHaveText('0');
});
