import {test,expect,type Page} from '@playwright/test';
import type {LessonBlockDocument} from '../../lib/lesson-blocks';
const initial:LessonBlockDocument={schemaVersion:1,blocks:[
 {id:'heading',type:'heading',content:'오늘의 실행 목표'},
 {id:'body',type:'text',content:'첫 문단입니다.\n\n두 번째 문단입니다.'},
 {id:'question',type:'question',question:{label:'어떤 업무인가요?',kind:'text',required:true}},
 {id:'end',type:'text',content:'마지막 안내입니다.'},
],checklist:[{id:'check',label:'확인했습니다',required:true}],completion:{mode:'mentor',requireAnswers:true,requireQuizPass:false}};
async function backend(page:Page, input=initial){
 let document=structuredClone(input),revision='aaaaaaaa-1111-4111-8111-111111111111';const writes:LessonBlockDocument[]=[];
 await page.route('**/api/platform/lesson-blocks**',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:{document,revision,editable:true}});return;}
  const body=route.request().postDataJSON();document=body.document;revision=body.requestId;writes.push(structuredClone(document));await route.fulfill({json:{revision}});
 });return{writes,get:()=>document};
}
const doc=(page:Page)=>page.getByRole('textbox',{name:'수업 문서',exact:true});
async function save(page:Page){await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.',{exact:true})).toBeVisible();}
test('top notice persists alongside existing activities without changing their identities',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await page.getByRole('button',{name:'필독 공지 추가',exact:true}).click();
 await page.keyboard.type('질문 제출 전에 읽어 주세요.');
 await expect(doc(page).locator('[data-lesson-callout]')).toHaveCount(1);
 await save(page);
 const saved=server.get();expect(saved.blocks[0].id).toBe('heading');expect(saved.blocks[0].type).toBe('text');expect(saved.blocks[0].content).toContain('callout');
 expect(saved.blocks.find(b=>b.id==='question')).toEqual(initial.blocks[2]);expect(saved.blocks.slice(1)).toEqual(initial.blocks.slice(1));
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(doc(page).locator('[data-lesson-callout]')).toContainText('질문 제출 전에 읽어 주세요.');
 await page.getByRole('button',{name:'필독 공지 추가',exact:true}).click();await expect(doc(page).locator('[data-lesson-callout]')).toHaveCount(1);
 await page.getByRole('button',{name:'구성 미리보기',exact:true}).click();await expect(page.getByLabel('구성 미리보기').locator('[data-lesson-callout]')).toContainText('질문 제출 전에 읽어 주세요.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('notice before a question gets a fresh text identity and can be undone safely',async({page})=>{
 const input={...initial,blocks:[initial.blocks[2]]};const server=await backend(page,input);await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await page.getByRole('button',{name:'필독 공지 추가',exact:true}).click();await page.keyboard.type('첫 질문 안내');await save(page);
 const saved=server.get();expect(saved.blocks).toHaveLength(2);expect(saved.blocks[0].type).toBe('text');expect(saved.blocks[0].id).not.toBe('question');expect(saved.blocks[1]).toEqual(input.blocks[0]);
 await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect(doc(page)).toContainText('어떤 업무인가요?');
 await expect(doc(page).locator('[data-author-block="question"]')).toBeVisible();
});
test('one continuous editor preserves the whole lesson on save and edits text without a body-edit button',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await expect(page.getByRole('button',{name:/본문 편집/})).toHaveCount(0);await expect(page.locator('.ProseMirror')).toHaveCount(1);
 await save(page);expect(server.get()).toEqual(initial);
 const paragraph=doc(page).locator('[data-author-block="body"] p').first();await paragraph.click();await page.keyboard.press('End');await page.keyboard.type(' 수정');
 await save(page);expect(server.get().blocks[1].content).toContain('수정');expect(server.get().blocks[1].id).toBe('body');expect(server.get().blocks[2]).toEqual(initial.blocks[2]);
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(doc(page)).toContainText('수정');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('insert at a caret retains surrounding text, configure question and undo without losing old answers',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await doc(page).locator('[data-author-block="body"] p').first().click();await page.keyboard.press('End');
 await page.getByRole('button',{name:'+ 현재 위치에 추가',exact:true}).click();await page.getByRole('group',{name:'문서에 넣을 항목'}).getByRole('button',{name:'중간 질문',exact:true}).click();
 const inspector=page.getByRole('complementary',{name:'선택 항목 설정'});await expect(inspector).toBeVisible();await inspector.getByLabel('질문 문구 *',{exact:true}).fill('새 질문');
 await save(page);expect(server.get().blocks.filter(b=>b.type==='question')).toHaveLength(2);expect(server.get().blocks.find(b=>b.id==='question')).toEqual(initial.blocks[2]);
 expect(server.get().blocks.map(b=>b.content||'').join('')).toContain('두 번째 문단');
 await page.getByRole('button',{name:'설정 닫기',exact:true}).click();await page.getByRole('button',{name:'실행 취소',exact:true}).click();
 await expect(doc(page)).toContainText('어떤 업무인가요?');
});
test('preview answers stay local and selecting all cannot accidentally erase existing activities',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await page.getByRole('button',{name:'구성 미리보기',exact:true}).click();await page.getByRole('button',{name:'입력·제출 체험',exact:true}).click();await page.getByLabel('구성 미리보기').getByRole('textbox',{name:'어떤 업무인가요?'}).fill('미리보기 답변');expect(server.writes).toHaveLength(0);
 await page.getByRole('button',{name:'편집 화면으로',exact:true}).click();await doc(page).locator('[data-author-block="body"] p').first().click();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.press('Backspace');
 await expect(doc(page)).toContainText('어떤 업무인가요?');await expect(page.getByRole('alert')).toContainText('질문·자료');
});
test('slash menu ignores composition and duplicate/delete retain distinct IDs with undo',async({page})=>{
 const server=await backend(page,{...initial,blocks:[{id:'empty',type:'text',content:''},initial.blocks[2]]});await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await doc(page).locator('[data-author-block="empty"] p').click();await doc(page).dispatchEvent('keydown',{key:'/',isComposing:true});await expect(page.getByRole('group',{name:'문서에 넣을 항목'})).toHaveCount(0);await page.keyboard.type('/');await expect(page.getByRole('group',{name:'문서에 넣을 항목'})).toBeVisible();
 await page.getByRole('group',{name:'문서에 넣을 항목'}).getByRole('button',{name:'본문',exact:true}).click();await page.keyboard.type('새 문단');
 await page.getByRole('button',{name:'항목 복제',exact:true}).click();await save(page);const ids=server.get().blocks.map(b=>b.id);expect(new Set(ids).size).toBe(ids.length);
 await doc(page).locator('[data-author-block="question"]').click({position:{x:5,y:5}});page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'항목 삭제',exact:true}).click();await expect(doc(page).locator('[data-author-block="question"]')).toHaveCount(0);await page.getByRole('button',{name:'실행 취소',exact:true}).click();await expect(doc(page).locator('[data-author-block="question"]')).toBeVisible();await save(page);expect(server.get().blocks.find(block=>block.id==='question')).toEqual(initial.blocks[2]);
});

test('clipboard image stays between paragraphs and survives saving with original question IDs',async({page})=>{
 const server=await backend(page);const assetId='cccccccc-1111-4111-8111-111111111111';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMwoAAAAASUVORK5CYII=','base64');
 await page.route('**/api/platform/lesson-media**',async route=>{if(route.request().method()==='GET'){await route.fulfill({contentType:'image/png',body:png});return;}const body=route.request().postDataJSON();await route.fulfill({json:body.action==='prepare'?{id:assetId,signedUrl:'/canvas-image-upload',contentType:'image/png'}:{id:assetId,ready:true}});});
 await page.route('**/canvas-image-upload',route=>route.fulfill({json:{}}));
 await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();await doc(page).locator('[data-author-block="body"] p').first().click();await page.keyboard.press('End');
 const clipboard=await page.evaluateHandle(bytes=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(bytes)],'pasted.png',{type:'image/png'}));return transfer;},[...png]);
 await doc(page).evaluate((element,clipboardData)=>element.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true})),clipboard);await clipboard.dispose();
 await expect(page.getByText('선택한 위치에 이미지를 넣었습니다. 아래 저장 버튼을 눌러 보관해 주세요.',{exact:true})).toBeVisible();await save(page);
 const blocks=server.get().blocks,index=blocks.findIndex(block=>block.assetId===assetId);expect(blocks[index-1].content).toContain('첫 문단');expect(blocks[index+1].content).toContain('두 번째 문단');expect(blocks.find(block=>block.id==='question')).toEqual(initial.blocks[2]);
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(doc(page).locator('[data-block-type="image"] img')).toBeVisible();
});

test('pasting paragraphs and formatting inline preserve activity identity and provide a heading outline',async({page},testInfo)=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await page.getByText('수업 목차 · 1개',{exact:true}).click();await page.getByRole('navigation',{name:'수업 목차'}).getByRole('button',{name:'오늘의 실행 목표',exact:true}).click();
 await doc(page).locator('[data-author-block="body"] p').first().click();await page.keyboard.press('End');
 const clipboard=await page.evaluateHandle(()=>{const transfer=new DataTransfer();transfer.setData('text/html','<p>붙여넣기 시작</p><h2>새 제목</h2><p><strong>굵은 안내</strong></p><p>마지막 붙여넣기</p>');return transfer;});
 await doc(page).evaluate((element,clipboardData)=>element.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true})),clipboard);await clipboard.dispose();await expect(doc(page).locator('strong')).toContainText('굵은 안내');await save(page);
 expect(server.get().blocks.find(block=>block.id==='question')).toEqual(initial.blocks[2]);await expect(page.getByRole('navigation',{name:'수업 목차'})).toContainText('새 제목');
 await page.screenshot({path:testInfo.outputPath('document-editor.png'),fullPage:true});
 if(testInfo.project.name==='mobile'){await page.setViewportSize({width:320,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});

test('format tools remain reachable when editing the bottom of a long lesson',async({page})=>{
 await backend(page,{...initial,blocks:[initial.blocks[0],...Array.from({length:109},(_,i)=>({id:`paragraph-${i}`,type:'text' as const,content:`연속 문서 ${i+1}번째 문단입니다.`})),initial.blocks[2]]});
 await page.goto('/lesson-block-author-test');await expect(doc(page)).toBeVisible();
 await doc(page).locator('[data-author-block="paragraph-90"] p').click();await page.keyboard.press('End');await page.keyboard.type(' 편집');
 const bar=await page.locator('.ldc-sticky-toolbar').boundingBox();expect(bar).not.toBeNull();expect(bar!.y).toBeGreaterThanOrEqual(0);expect(bar!.y+bar!.height).toBeLessThan((await page.viewportSize())!.height);
 await page.getByRole('button',{name:'굵게',exact:true}).click();await page.keyboard.type(' 강조');await expect(doc(page).locator('[data-author-block="paragraph-90"] strong')).toContainText('강조');
});

test('image and link settings stay reachable beside a long embedded lesson and deletion closes the panel',async({page},info)=>{
 const blocks:LessonBlockDocument['blocks']=[...Array.from({length:80},(_,i)=>({id:`long-${i}`,type:'text' as const,content:`긴 수업 안내 ${i+1}. 본문을 보면서 자료를 수정합니다.`})),{id:'photo',type:'image',url:'https://example.test/preview.png',content:'설명 이미지',alt:'원래 설명'},{id:'reference',type:'link',url:'https://example.test/guide',content:'참고 링크'},...Array.from({length:12},(_,i)=>({id:`after-${i}`,type:'text' as const,content:`아래 안내 ${i+1}`}))];
 const server=await backend(page,{...initial,blocks});
 await page.route('https://example.test/preview.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMwoAAAAASUVORK5CYII=','base64')}));
 await page.goto('/lesson-block-author-test?embedded');await expect(doc(page)).toBeVisible();
 const photo=doc(page).locator('[data-author-block="photo"]');await photo.getByRole('button',{name:'이미지 설정',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'선택 항목 설정'});
 async function onScreen(){await expect.poll(async()=>{const b=await panel.boundingBox();return !!b&&b.y>=60&&b.y+b.height<=(page.viewportSize()!.height-70)&&b.x>=0&&b.x+b.width<=page.viewportSize()!.width;}).toBe(true);}
 await onScreen();expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(1000);
 await page.evaluate(()=>window.scrollBy(0,180));await onScreen();
 await panel.getByLabel('이미지 대체 설명',{exact:true}).fill('수정한 이미지 설명');await onScreen();expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(1000);
 await page.screenshot({path:info.outputPath('floating-image-settings.png')});
 page.once('dialog',dialog=>dialog.accept());await panel.getByRole('button',{name:/항목 \d+ 삭제/,exact:true}).click();await expect(panel).toHaveCount(0);await expect(doc(page).locator('[data-author-block="photo"]')).toHaveCount(0);
 await doc(page).locator('[data-author-block="reference"]').getByRole('button',{name:'외부 링크 설정',exact:true}).click();await onScreen();
 await panel.getByLabel('주소 *',{exact:true}).fill('https://example.test/updated');await panel.getByLabel('링크에 표시할 문구',{exact:true}).fill('수정한 참고 링크');
 await panel.getByRole('button',{name:'설정 닫기',exact:true}).click();await page.getByRole('button',{name:'학습 저장',exact:true}).last().click();await expect.poll(()=>server.writes.length).toBe(1);
 expect(server.get().blocks.some(b=>b.id==='photo')).toBe(false);expect(server.get().blocks.find(b=>b.id==='reference')).toMatchObject({url:'https://example.test/updated',content:'수정한 참고 링크'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
