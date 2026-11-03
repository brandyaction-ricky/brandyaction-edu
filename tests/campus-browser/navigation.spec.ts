import {test,expect} from '@playwright/test';
// These checks isolate shell navigation; original renderer tests cover 3D behavior separately.
test.beforeEach(async({page})=>{await page.route('**/campus/world/**/index.html*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Navigation test space</title>'}));});
test('immersive space keeps return controls and section history',async({page})=>{
 await page.goto('/space?view=immersive');
 await expect(page.locator('[data-campus-view]')).toHaveAttribute('data-campus-view','immersive');
 await expect(page.getByRole('navigation',{name:'문샷 기능'})).toBeHidden();
 await page.getByRole('button',{name:'이동 메뉴',exact:true}).click();
 await page.getByRole('navigation',{name:'문샷 기능'}).getByRole('button',{name:'실행 수첩',exact:true}).click();
 await expect(page.getByRole('heading',{name:'나의 실행 수첩'})).toBeVisible();
 await expect(page).toHaveURL(/section=journal/);
 await page.getByRole('button',{name:'이전 캠퍼스 화면'}).click();
 await expect(page.getByRole('region',{name:'문샷 캠퍼스 공간'})).toBeVisible();
 await page.goBack();
 await expect(page.getByRole('heading',{name:'나의 실행 수첩'})).toBeVisible();
 await page.getByRole('button',{name:'← 공간으로 돌아가기',exact:true}).click();
 await page.getByRole('button',{name:'기본 화면',exact:true}).click();
 await expect(page.locator('[data-campus-view]')).toHaveAttribute('data-campus-view','page');
 await expect(page.getByRole('navigation',{name:'문샷 기능'})).toBeVisible();
});
test('lesson opens with a safe explicit campus return and restores the selected section',async({page})=>{
 await page.goto('/workspace?navigationQA=1&view=immersive');
 await page.getByRole('button',{name:/DAY 01/}).click();
 await expect(page.getByRole('heading',{name:'예시 수업 · 한 장 지도 작성'})).toBeVisible();
 const back=page.getByRole('link',{name:'← 캠퍼스로 돌아가기'});
 await expect(back).toHaveAttribute('href',/\/campus\/workspace\?enrollmentId=.*section=learning.*view=immersive/);
 await back.click();await expect(page.locator('[data-campus-view]')).toHaveAttribute('data-campus-view','immersive');
 await expect(page.getByRole('heading',{name:'성장·미션',exact:true})).toBeVisible();
});
test('fullscreen rejection retains usable immersive view and exit',async({page})=>{
 await page.addInitScript(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('not supported'));});
 await page.goto('/space');await page.getByRole('button',{name:'전체화면',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'주소창을 숨길 수 없어'})).toBeVisible();
 await expect(page.locator('[data-campus-view]')).toHaveAttribute('data-campus-view','immersive');
 await page.getByRole('button',{name:'기본 화면',exact:true}).click();
 await expect(page.locator('[data-campus-view]')).toHaveAttribute('data-campus-view','page');
});
test('immersive tools and compact fallback remain reachable without horizontal overflow',async({page})=>{
 await page.goto('/space?view=immersive');
 await page.getByRole('button',{name:'집중·대화·내 자리'}).click();
 await expect(page.getByRole('tab',{name:'집중과 휴식'})).toBeVisible();
 await page.getByRole('button',{name:'가벼운 공간 메뉴',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'문샷 공간 선택'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'도구 닫기',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'문샷 공간 선택'})).toBeVisible();
});
test('native fullscreen can be entered and exited with visible controls',async({page})=>{
 await page.goto('/workspace');await page.getByRole('button',{name:'전체화면',exact:true}).click();
 await expect(page.getByRole('button',{name:'전체화면 종료',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.fullscreenElement?.getAttribute('data-campus-view'))).toBe('immersive');
 await page.getByRole('button',{name:'전체화면 종료',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
 await expect(page.getByRole('button',{name:'기본 화면'})).toBeVisible();
});
test('cancelled navigation keeps an unsaved space note',async({page})=>{
 await page.goto('/space?view=immersive');await page.getByRole('button',{name:'집중·대화·내 자리'}).click();
 await page.getByLabel('나만 보는 메모',{exact:true}).fill('아직 저장하지 않은 메모');
 await page.getByRole('button',{name:'이동 메뉴',exact:true}).click();
 page.once('dialog',d=>d.dismiss());
 await page.getByRole('navigation',{name:'문샷 기능'}).getByRole('button',{name:'실행 수첩',exact:true}).click();
 await expect(page.getByLabel('나만 보는 메모',{exact:true})).toHaveValue('아직 저장하지 않은 메모');
 await expect(page.getByRole('heading',{name:'문샷 공간',exact:true})).toBeVisible();
});
