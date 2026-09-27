import {test,expect} from '@playwright/test';
import {recruitmentJoinHtml,RECRUITMENT_JOIN_HEADERS} from '../../lib/recruitment-join';
test('join screen has a keyboard accessible explicit action and no automatic navigation',async({page})=>{
 let posts=0;
 await page.route('**/join/synthetic/paid',async route=>{
  if(route.request().method()==='POST'){posts++;expect(new URLSearchParams(route.request().postData()!).get('version')).toBe('1');expect(route.request().headers().origin).toBe('http://127.0.0.1:4173');return route.fulfill({headers:RECRUITMENT_JOIN_HEADERS,contentType:'text/html; charset=utf-8',body:'<h1>합성 이동 확인</h1>'});}
  return route.fulfill({headers:RECRUITMENT_JOIN_HEADERS,contentType:'text/html; charset=utf-8',body:recruitmentJoinHtml('합성 모집',1,'11111111-1111-4111-8111-111111111111')});
 });
 await page.goto('/join/synthetic/paid');
 await expect(page.getByRole('heading',{name:'AI 에이전트 마케팅 교육'})).toBeVisible();
 expect(posts).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'카톡방으로 이동하기'}).focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'합성 이동 확인'})).toBeVisible();expect(posts).toBe(1);
});
