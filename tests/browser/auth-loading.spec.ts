import { expect, test } from '@playwright/test';

const member = { id: 'synthetic-member', full_name: '합성 회원', email: 'member@example.test', role: 'member' };

test('session recovery finishes before member data; returning to the app verifies again', async ({ page }) => {
  let recovered = false;
  let reads = 0;
  await page.route('**/synthetic-auth/session', async route => {
    recovered = true;
    await route.fulfill({ json: {} });
  });
  await page.route('**/api/platform?**', async route => {
    expect(recovered).toBe(true);
    reads++;
    await route.fulfill({ json: { user: member, data: { enrollments: [], courses: [] }, support: {} } });
  });
  await page.goto('/public-data-test?publicScreen=my');
  await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible();
  const originalHeading = await page.getByRole('heading', { name: '마이페이지' }).elementHandle();
  const before = reads;
  recovered = false;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => reads).toBeGreaterThan(before);
  expect(await originalHeading!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
});

test('temporary session recovery failure offers retry without declaring logout', async ({ page }) => {
  await page.route('**/synthetic-auth/session', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/public-data-test?publicScreen=my');
  await expect(page.getByRole('alert')).toContainText('로그인 정보를 확인하지 못했습니다.');
  await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
});

test('a revoked session is still rejected by the server on app return', async ({ page }) => {
  let revoked = false;
  await page.route('**/api/platform?**', route => route.fulfill(revoked
    ? { status: 401, json: { user: null, error: '로그인이 필요합니다.' } }
    : { json: { user: member, data: { enrollments: [], courses: [] }, support: {} } }));
  await page.goto('/public-data-test?publicScreen=my');
  await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible();
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '마이페이지' })).toHaveCount(0);
});

test('member dashboard waits for the identity response before deciding whether to show login', async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/platform?**', async route => {
    await pending;
    await route.fulfill({ json: { user: member, data: { enrollments: [], courses: [] }, support: {} } });
  });
  await page.goto('/public-data-test?publicScreen=my');
  try {
    await expect(page.locator('.member-loading-skeleton')).toBeVisible();
    await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('.member-loading-skeleton')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '마이페이지' })).toBeVisible();
  await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
});

test('completed unauthenticated read shows login only after the pending state', async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/platform?**', async route => {
    await pending;
    await route.fulfill({ status: 401, json: { user: null, error: '로그인이 필요합니다.' } });
  });
  await page.goto('/public-data-test?publicScreen=my');
  try {
    await expect(page.locator('.member-loading-skeleton')).toBeVisible();
    await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('failed member read offers retry instead of a false login decision', async ({ page }) => {
  await page.route('**/api/platform?**', route => route.fulfill({ status: 503, json: { error: '합성 조회 오류' } }));
  await page.goto('/public-data-test?publicScreen=my');
  await expect(page.getByRole('alert')).toContainText('합성 조회 오류');
  await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
});

for (const screen of ['my/missions', 'learn/synthetic-enrollment']) {
  test(`${screen} waits for its own member data before showing a decision`, async ({ page }) => {
    let release = () => {};
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/platform?**', async route => {
      await pending;
      await route.fulfill({ json: { user: member, data: { enrollments: [], courses: [] }, support: {} } });
    });
    await page.goto(`/public-data-test?publicScreen=${encodeURIComponent(screen)}`);
    try {
      await expect(page.locator('.member-loading-skeleton')).toBeVisible();
      await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
      await expect(page.getByRole('link', { name: /로그인·회원가입/ })).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.locator('.member-loading-skeleton')).toHaveCount(0);
    await expect(page.getByText('로그인하고 학습을 이어가세요.')).toHaveCount(0);
  });
}

test('logging out on a PC leaves the independently signed-in app session active',async({browser})=>{
 const pc=await browser.newContext(),app=await browser.newContext();
 const sessions={pc:true,app:true};const scopes:string[]=[];
 try {
  for(const [device,context] of [['pc',pc],['app',app]] as const){
   await context.route('**/api/platform?**',route=>route.fulfill(sessions[device]
    ?{json:{user:member,data:{enrollments:[],courses:[]},support:{}}}
    :{status:401,json:{user:null,error:'로그인이 필요합니다.'}}));
   await context.route('**/synthetic-auth/signout',async route=>{
    const scope=route.request().postDataJSON().scope || 'global';scopes.push(scope);
    if(scope==='local')sessions[device]=false;else {sessions.pc=false;sessions.app=false;}
    await route.fulfill({json:{}});
   });
  }
  const pcPage=await pc.newPage(),appPage=await app.newPage();
  await appPage.goto('/public-data-test?publicScreen=my');await expect(appPage.getByRole('heading',{name:'마이페이지'})).toBeVisible();
  await pcPage.goto('/public-data-test?publicScreen=my');await expect(pcPage.getByRole('heading',{name:'마이페이지'})).toBeVisible();
  await pcPage.getByRole('button',{name:'내 프로필 메뉴',exact:true}).click();
  await pcPage.getByRole('button',{name:'로그아웃',exact:true}).first().click();
  expect(scopes).toEqual(['local']);expect(sessions.pc).toBe(false);expect(sessions.app).toBe(true);
  await appPage.reload();await expect(appPage.getByRole('heading',{name:'마이페이지'})).toBeVisible();
  sessions.pc=true;await pcPage.goto('/public-data-test?publicScreen=my');
  await appPage.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await expect(appPage.getByRole('heading',{name:'마이페이지'})).toBeVisible();
 } finally {await pc.close();await app.close();}
});
