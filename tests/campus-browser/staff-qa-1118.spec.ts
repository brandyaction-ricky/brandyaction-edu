import {test,expect,type Page} from '@playwright/test';
// Staff QA 11-17 (OS 3c370915): R2 Back closes the campus window, R3 the work draft is never dropped silently, G2/G4 in-page confirms.
async function open(page:Page){
 await page.route('**/campus/world/tour/index.html*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><p>x</p>'}));await page.goto('/campus-tour');
 const map=page.getByRole('dialog',{name:'공간 이동',exact:true});if(!await map.isVisible())await page.getByRole('button',{name:'공간 이동',exact:true}).click();await map.getByRole('button',{name:'문샷 공부방 입장',exact:true}).click();
 await page.getByRole('button',{name:'이 공간에서 할 일',exact:true}).click();const menu=page.getByRole('region',{name:'이 공간에서 할 일',exact:true});await menu.getByLabel('할 일 검색').fill('결과물·동료 피드백');await menu.getByRole('button',{name:'결과물·동료 피드백',exact:true}).click();
 return page.getByRole('dialog',{name:'결과물·동료 피드백'});
}
test('Back closes the window; with a draft it asks first and keeps the text',async({page})=>{
 const d=await open(page);const url=page.url();
 await page.goBack();await expect(d).toBeHidden();expect(page.url()).toBe(url);
 await page.getByRole('button',{name:'이 공간에서 할 일',exact:true}).click();await page.getByRole('region',{name:'이 공간에서 할 일',exact:true}).getByRole('button',{name:'결과물·동료 피드백',exact:true}).click();
 await d.getByRole('button',{name:'결과물 남기기',exact:true}).first().click();await d.getByLabel('제목',{exact:true}).fill('사라지면 안 되는 제목');
 page.once('dialog',x=>x.dismiss());await page.goBack();await expect(d).toBeVisible();await expect(d.getByLabel('제목',{exact:true})).toHaveValue('사라지면 안 되는 제목');
 page.once('dialog',x=>x.accept());await page.goBack();await expect(d).toBeHidden();expect(page.url()).toBe(url);
});
test('inner close asks before dropping a work draft; phone number asks in the page',async({page})=>{
 const browserDialogs:string[]=[];page.on('dialog',x=>{browserDialogs.push(x.message());void x.dismiss();});
 const d=await open(page);
 await d.getByRole('button',{name:'결과물 남기기',exact:true}).first().click();await d.getByLabel('제목',{exact:true}).fill('사라지면 안 되는 제목');
 await d.getByRole('button',{name:'작성 닫기',exact:true}).click();
 const box=page.getByRole('alertdialog',{name:'확인'});await expect(box).toContainText('작성 중인 결과물을 닫을까요?');
 await box.getByRole('button',{name:'취소'}).click();await expect(d.getByLabel('제목',{exact:true})).toHaveValue('사라지면 안 되는 제목');
 await d.getByLabel('누구에게 무엇을 파나요?').fill('연락은 010-1234-5678 로 주세요. 지역 공방을 위한 첫 제안입니다.');
 await d.getByLabel('작업물 링크').fill('https://example.com/work');
 await d.getByRole('button',{name:'기수에 공유하며 저장',exact:true}).click();
 await expect(box).toContainText('전화번호처럼 보이는 내용이 있어요');await box.getByRole('button',{name:'취소'}).click();
 await expect(d.getByRole('alert')).toContainText('전화번호를 지운 뒤');
 expect(browserDialogs).toEqual([]);
});
