import { test, expect } from '@playwright/test';
for(const kind of ['free-live','moonshot']) test(`candidate copy ${kind} is readable at each viewport and uses the protected CTA`,async({page},info)=>{
 await page.goto('/stabilization-copy-test?kind='+kind);
 const frame=page.frameLocator('iframe[title="상품 HTML 상세페이지"]');
 await expect(frame.getByRole('heading',{level:1})).toBeVisible();
 expect(await frame.locator('body').evaluate(body=>body.scrollWidth<=body.ownerDocument.documentElement.clientWidth+1)).toBe(true);
 await expect(frame.getByRole('link').first()).toHaveAttribute('aria-disabled','false');
 await page.screenshot({path:info.outputPath(kind+'.png'),fullPage:true});
 await frame.getByRole('link').first().click();
 await expect(page).toHaveURL('/safe-custom');
});
test('error recovery gives order history guidance and retry without exposing internal error',async({page})=>{
 await page.goto('/recovery-test');
 await expect(page.getByRole('alert')).toContainText('중복 결제하지 말고');
 await expect(page.getByRole('link',{name:'주문 내역 확인'})).toHaveAttribute('href','/my/orders');
 await expect(page.getByText('synthetic failure')).toHaveCount(0);
 await page.getByRole('button',{name:'다시 불러오기'}).click();
 await expect(page.getByRole('heading',{name:'화면을 다시 불러왔습니다.'})).toBeVisible();
});
test('publish review flags claims without discarding or automatically rewriting the draft',async({page})=>{
 await page.goto('/product-sale-test?draft');
 await page.getByLabel('상품명',{exact:true}).fill('매출 보장 99% 자동화');
 await page.getByRole('tab',{name:'공개·검색',exact:true}).click();
 await expect(page.getByLabel('고객 안내 문구 확인')).toContainText('성과 수치의 출처');
 await expect(page.getByLabel('고객 안내 문구 확인')).toContainText('성공이나 수익을 확정');
 await page.getByRole('tab',{name:'기본·판매',exact:true}).click();
 await expect(page.getByLabel('상품명',{exact:true})).toHaveValue('매출 보장 99% 자동화');
 await expect(page.getByLabel('합성 저장 횟수')).toHaveText('0');
});
