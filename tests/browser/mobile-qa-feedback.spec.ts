import { test, expect } from '@playwright/test';

test('header help remains visible and fits narrow mobile screens', async ({ page }) => {
  await page.route('**/api/platform?**', r => r.fulfill({json:{user:{id:'synthetic',full_name:'검증 회원',role:'student'},data:{review_videos:[]},support:{}}}));
  await page.goto('/public-data-test?publicScreen=stories');
  for (const width of [320,390,834,1440]) {
    await page.setViewportSize({width,height:844});
    const action=page.locator('.header-questions');
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute('href','/my/questions');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

for(const flags of [{enabled:false,articlesEnabled:false},{enabled:true,articlesEnabled:false},{enabled:false,articlesEnabled:true}]) {
 test(`public visibility switches ${JSON.stringify(flags)}`,async({page})=>{
  await page.route('**/api/platform?**',r=>r.fulfill({json:{user:null,data:{articles:[{id:'one',slug:'one',title:'합성 아티클'}],article_banner:[{id:'banner',value:{...flags,title:'합성 무료강의',videos:[{title:'등록된 영상',available:true,url:''},{title:'주소 없는 영상',available:false,url:''}]}}]},support:{}}}));
  await page.goto('/public-data-test?publicScreen=articles');
  await expect(page.locator('.article-library')).toHaveCount(flags.articlesEnabled?1:0);
  await expect(page.locator('.ab-banner')).toHaveCount(flags.enabled?1:0);
  await expect(page.locator('.main-nav a[href="/articles"]')).toHaveCount(flags.enabled||flags.articlesEnabled?1:0);
  if(flags.enabled){await expect(page.locator('.ab-lesson')).toHaveCount(1);await expect(page.getByText('주소 없는 영상')).toHaveCount(0);}
 });
}

test('empty video URLs never render a dead video player',async({page})=>{
 await page.route('**/api/platform?**',r=>r.fulfill({json:{user:null,data:{article_banner:[{id:'banner',value:{enabled:true,videos:[{title:'미등록 영상',available:false,url:''}]}}]},support:{}}}));
 await page.goto('/public-data-test?publicScreen=articles');
 await expect(page.locator('.article-library')).toBeVisible();
 await expect(page.locator('.ab-banner')).toHaveCount(0);
});
