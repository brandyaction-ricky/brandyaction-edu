import { test, expect, type Page } from '@playwright/test';
// CEO 2026-10-15: EDU reports get MYIN's scroll emphasis in the open reader only. Synthetic redesign-shaped HTML:
// the motion attaches only when the issued report carries the redesign style, and never inside the frame's own scripts.
const submitted={state:'submitted',revision:8,answers:[],submittedAt:'2026-10-01T00:00:00Z',needsReview:false,survey:{code:'needs6_n30',version:'synthetic',title:'합성 N6 검사',coreQuestionCount:0,questions:[]}};
const steps='<div class="v-flow"><div class="v-step"><span class="v-step-no">01</span><strong>조건 적기</strong></div><div class="v-step"><span class="v-step-no">02</span><strong>확인 나누기</strong></div><div class="v-step"><span class="v-step-no">03</span><strong>작게 시험하기</strong></div></div>';
const html=`<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style data-visual-redesign="v1">.v-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.v-step{border:1px solid #ddd;padding:12px}</style></head><body><h1>합성 정밀 보고서</h1><div style="height:1500px"></div><section id="s3">${steps}</section><div style="height:1500px"></div><script>window.reportExecuted=true</script></body></html>`;
async function open(page:Page){
  await page.route('**/api/platform/diagnosis/session',r=>r.fulfill({json:submitted}));
  await page.context().addCookies([{name:'diagnosis_download_fixture',value:'original',url:`http://127.0.0.1:${process.env.FIXTURE_PORT || 4173}`}]);
  await page.context().route('**/api/platform/diagnosis/report*',r=>new URL(r.request().url()).searchParams.has('html')
    ?r.fulfill({contentType:'text/html; charset=utf-8',body:html}):r.fulfill({json:{state:'ready',updatedAt:'2026-10-01T00:00:00.000Z',canRetry:false,downloadAvailable:true}}));
  await page.goto('/diagnosis-test?reports');
  await page.getByRole('button',{name:'보고서 열기',exact:true}).click();
  const frame=page.frameLocator('iframe[title="나의 N6 정밀 보고서"]');
  await expect(frame.getByRole('heading',{name:'합성 정밀 보고서'})).toBeVisible();
  return frame;
}

test('scroll emphasis starts once a diagram scrolls in, the text stays and no script runs in the report',async({page})=>{
  const frame=await open(page),flow=frame.locator('.v-flow');
  await expect(flow).toHaveAttribute('data-myin-motion-state','ready');
  await expect(frame.locator('#myin-precision-motion')).toHaveCount(1);
  await flow.evaluate(el=>el.ownerDocument.defaultView!.scrollTo(0,el.getBoundingClientRect().top+el.ownerDocument.defaultView!.scrollY-100));
  await expect(frame.locator('.v-step[data-myin-motion-play="playing"]').first()).toBeAttached();
  await expect(frame.locator('.v-step')).toHaveText(['01조건 적기','02확인 나누기','03작게 시험하기']);
  expect(await frame.locator('body').evaluate(()=>Object.hasOwn(window,'reportExecuted'))).toBe(false);
  await page.getByRole('button',{name:'보고서 닫기'}).click();
  await expect(page.getByRole('region',{name:'나의 정밀 보고서',exact:true})).toHaveCount(0);
});

test('reduced motion keeps the report static',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const frame=await open(page);
  await expect(frame.locator('#myin-precision-motion')).toHaveCount(0);
  await expect(frame.locator('[data-myin-motion]')).toHaveCount(0);
});
