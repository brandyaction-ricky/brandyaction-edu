import { expect, test, type Page } from '@playwright/test';
async function api(page:Page,{eligible=true,failSave=false}={}) {
  let review:Record<string,unknown>|null=null,posts=0;
  await page.route('**/api/product-reviews?**',async route=>{
    const p=new URL(route.request().url()).searchParams;
    if(p.get('context'))return route.fulfill({json:{enrollmentId:eligible?'11111111-1111-4111-8111-111111111111':null,review}});
    const current=Number(p.get('page')||1);
    return route.fulfill({json:{rows:Array.from({length:current===1?10:3},(_,i)=>({id:current+'-'+i,author:'문**',rating:5,body:i===0?'수업을 따라 실행하며 고객의 문제를 구체적으로 정리할 수 있었어요.\n작은 실행을 쌓아 가는 데 도움이 됐습니다.':'직접 해 보면서 배울 수 있어서 좋았습니다.',published_at:'2026-11-10T00:00:00Z'})),summary:{count:13,average:4.8},page:current,hasMore:current===1}});
  });
  await page.route('**/api/platform',async route=>{
    if(route.request().method()!=='POST')return route.fulfill({json:{}});
    posts++;const body=route.request().postDataJSON();
    if(failSave)return route.fulfill({status:503,json:{error:'저장 연결을 다시 확인해 주세요.'}});
    review={id:'mine',rating:body.rating,body:body.content,status:'pending'};
    return route.fulfill({json:{ok:true}});
  });
  return{posts:()=>posts,review:()=>review};
}
test('detail shows review tab, summary and paginated readable reviews',async({page},info)=>{
  await api(page);await page.goto('/product-reviews-test');
  await expect(page.getByRole('link',{name:'리뷰 (13)',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'리뷰 (13)',exact:true}).click();
  const section=page.locator('#product-reviews');await expect(section.getByText('5점 만점 · 공개 후기 13개')).toBeVisible();
  await expect(section.locator('article')).toHaveCount(10);
  await expect(section.getByText('문**',{exact:true}).first()).toBeVisible();
  await section.screenshot({path:`/private/tmp/edu-review-previews/${info.project.name}-list.png`});
  await page.getByRole('button',{name:'후기 더 보기'}).click();await expect(section.locator('article')).toHaveCount(13);await expect(page.getByRole('button',{name:'후기 더 보기'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('detail creates one pending review, reopening edits the same review and keyboard close restores focus',async({page},info)=>{
  const state=await api(page);await page.goto('/product-reviews-test');
  const entry=page.getByRole('button',{name:'리뷰 작성',exact:true});await entry.click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('textbox',{name:'수강 경험'})).toBeVisible();
  await dialog.getByRole('radio',{name:'4점',exact:true}).check();await dialog.getByRole('textbox',{name:'수강 경험'}).fill('고객 문제를 정리하고 직접 실행해 보게 됐어요.');
  await dialog.screenshot({path:`/private/tmp/edu-review-previews/${info.project.name}-write.png`});
  await dialog.getByRole('button',{name:'후기 저장',exact:true}).click();await expect(dialog).toHaveCount(0);expect(state.posts()).toBe(1);expect(state.review()?.rating).toBe(4);
  await entry.click();await expect(page.getByRole('heading',{name:'리뷰 수정'})).toBeVisible();await expect(page.getByRole('textbox',{name:'수강 경험'})).toHaveValue('고객 문제를 정리하고 직접 실행해 보게 됐어요.');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(entry).toBeFocused();
});
test('save failure keeps draft and ineligible members cannot submit',async({page})=>{
  const state=await api(page,{failSave:true});await page.goto('/product-reviews-test');await page.getByRole('button',{name:'리뷰 작성',exact:true}).click();
  const text=page.getByRole('textbox',{name:'수강 경험'});await text.fill('저장 실패해도 남아야 하는 후기');await page.getByRole('button',{name:'후기 저장',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveText('저장 연결을 다시 확인해 주세요.');await expect(text).toHaveValue('저장 실패해도 남아야 하는 후기');expect(state.posts()).toBe(1);
  await page.getByRole('button',{name:'취소',exact:true}).click();
  await page.unroute('**/api/product-reviews?**');await api(page,{eligible:false});await page.getByRole('button',{name:'리뷰 작성',exact:true}).click();
  await expect(page.getByRole('dialog').getByText('이 클래스를 수강 중인 계정에서 후기를 작성할 수 있어요.')).toBeVisible();await expect(page.getByRole('button',{name:'후기 저장',exact:true})).toHaveCount(0);
});
test('guests go through login and classroom opens the shared review composer',async({page})=>{
  await api(page);await page.goto('/product-reviews-test?guest');await expect(page.getByRole('link',{name:'로그인하고 리뷰 작성'})).toHaveAttribute('href',/^\/login\?next=/);
  await page.goto('/classroom-questions-test');await page.getByRole('button',{name:'리뷰 작성',exact:true}).click();await expect(page.getByRole('dialog').getByRole('textbox',{name:'수강 경험'})).toBeVisible();
});
test('my reviews uses the same composer and refreshes its list after save',async({page})=>{
  await api(page);await page.goto('/product-reviews-test?member');await page.getByRole('button',{name:'리뷰 작성',exact:true}).click();await page.getByRole('textbox',{name:'수강 경험'}).fill('세 화면에서 같은 후기를 수정할 수 있어요.');await page.getByRole('button',{name:'후기 저장',exact:true}).click();
  await expect(page.getByText('세 화면에서 같은 후기를 수정할 수 있어요.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'리뷰 수정',exact:true}).click();await expect(page.getByRole('textbox',{name:'수강 경험'})).toHaveValue('세 화면에서 같은 후기를 수정할 수 있어요.');
});
