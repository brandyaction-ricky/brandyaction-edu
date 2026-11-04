import { expect, test } from '@playwright/test';
const id=(n:number)=>`aaaaaaac-1111-4111-8111-${String(n).padStart(12,'0')}`;

test('lesson navigation keeps the selected lesson visible without scrolling the document', async ({page}, info) => {
  let writes=0;
  await page.route('**/api/platform/lesson-blocks**', async route => {
    if(route.request().method() !== 'GET') { writes++; await route.fulfill({status:500}); return; }
    if(new URL(route.request().url()).searchParams.get('action') === 'progression') {
      await route.fulfill({json:{lessons:Array.from({length:25},(_,i)=>({lessonId:id(i<4?i+10:i+11),track:'daily',dayNumber:i+1,isUnlocked:true}))}}); return;
    }
    await route.fulfill({json:{document:{schemaVersion:1,blocks:[{id:'a',type:'heading',content:'첫 번째 내용'},{id:'text',type:'text',content:'가상의 학습 본문'},{id:'b',type:'heading',content:'두 번째 내용'},{id:'rich',type:'text',content:'edu-lesson:v1\n'+JSON.stringify({type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'서식 본문 제목'}]},{type:'paragraph',content:[{type:'text',text:'서식 본문'}]}]})},{id:'logo',type:'image',url:'https://example.test/logo.svg',alt:'어사이드 로고'},{id:'screen',type:'image',url:'https://example.test/logo.svg',alt:'로고 설정 화면'}],checklist:[],completion:{mode:'self',requireAnswers:false,requireQuizPass:false}},revision:id(90),currentRevision:id(90),draft:null,previousDrafts:[]}});
  });
  await page.route('https://example.test/logo.svg', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>'}));
  await page.goto('/lesson-progression-test?long');
  await expect(page.locator('.lesson-header')).toContainText('합성 학습 34');
  const nav=page.locator('.learning-nav'), selected=nav.locator('.lesson-nav.active');
  if(info.project.name === 'mobile') {
    const toggle=page.getByRole('button',{name:'학습 목록'});
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded','true');
  } else await expect(page.getByRole('button',{name:'학습 목록'})).toBeHidden();
  await expect.poll(async()=>selected.evaluate(el=>{const a=el.getBoundingClientRect(), n=el.closest('.learning-nav')!.getBoundingClientRect();return a.top>=n.top && a.bottom<=n.bottom;})).toBe(true);
  expect(await page.evaluate(()=>window.scrollY)).toBeLessThan(250);
  const container=page.locator('.learning-content');
  await expect(container).toHaveCSS('border-top-width','0px');
  await page.locator('.lesson-outline summary').click();
  await page.getByRole('button',{name:'서식 본문 제목'}).click();
  await expect(page.getByRole('heading',{name:'서식 본문 제목'})).toBeInViewport();
  await page.getByRole('button',{name:'두 번째 내용'}).click();
  await expect(page.getByRole('heading',{name:'두 번째 내용'})).toBeInViewport();
  await page.getByRole('button',{name:'학습 맨 위로'}).click();
  await expect(page.locator('.learning-progress-summary')).toBeInViewport();
  const logo=page.locator('.lb-image-open img[alt="어사이드 로고"]');
  const screen=page.locator('.lb-image-open img[alt="로고 설정 화면"]');
  await expect(logo).toBeVisible();
  expect(await logo.evaluate(el=>el.getBoundingClientRect().width)).toBe(info.project.name==='mobile'?96:200);
  expect(await screen.evaluate(el=>el.getBoundingClientRect().width)).toBe(200);
  await logo.click();
  await expect(page.getByRole('dialog',{name:'이미지 크게 보기'})).toBeVisible();
  await page.getByRole('button',{name:'닫기'}).click();
  expect(writes).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
