import {test,expect} from '@playwright/test';
test.setTimeout(120000);
// Exercise the imported renderer, native modals and real host bridge together.
test('furniture opens task windows without recreating the room, losing drafts or timer',async({page})=>{
 await page.goto('/space?spatial=1');
 const world=page.frameLocator('iframe');
 await expect(world.getByRole('button',{name:'집중하기',exact:true})).toBeVisible({timeout:90000});
 const initialFrame=await page.locator('iframe').getAttribute('src');
 await expect(page.getByRole('navigation',{name:'문샷 기능'})).toBeHidden();
 await expect(page.getByRole('button',{name:'집중 시작',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'동료와 함께하기',exact:true}).click();
 await world.getByRole('button',{name:'집중하기',exact:true}).click();
 const focus=page.getByRole('dialog',{name:'집중과 휴식',exact:true});await expect(focus).toBeVisible();
 await expect(focus.getByRole('button',{name:/내 자리/})).toBeVisible();
 await focus.getByRole('button',{name:'집중 시작',exact:true}).click();
 await focus.getByLabel('나만 보는 메모',{exact:true}).fill('닫아도 유지하는 작성 중 메모');
 await focus.getByRole('button',{name:'집중과 휴식 닫기'}).click();await expect(focus).toBeHidden();
 await expect(page.getByRole('button',{name:'집중 타이머 열기'})).toBeVisible();
 await world.getByRole('button',{name:'수업·과제',exact:true}).click();
 const learning=page.getByRole('dialog',{name:'수업·과제',exact:true});await expect(learning).toBeVisible();
 await expect(page).toHaveURL(/section=learning/);await expect(page.locator('iframe')).toHaveAttribute('src',initialFrame!);
 await learning.getByRole('button',{name:'수업·과제 닫기'}).click();
 await page.getByRole('button',{name:'집중 타이머 열기'}).click();
 await expect(focus.getByLabel('나만 보는 메모',{exact:true})).toHaveValue('닫아도 유지하는 작성 중 메모');
 await focus.press('Escape');await expect(focus).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('inside guide reaches secondary tools, keyboard dialog and browser history return',async({page})=>{
 await page.goto('/space?spatial=1');const world=page.frameLocator('iframe');
 await expect(world.getByRole('button',{name:'동료와 대화',exact:true})).toBeVisible({timeout:90000});
 await world.getByRole('button',{name:'내 도구'}).click();
 await world.getByRole('button',{name:'내 실행 수첩',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'실행 수첩',exact:true})).toBeVisible();
 await page.goBack();await expect(page.getByRole('dialog',{name:'실행 수첩',exact:true})).toBeHidden();
 await world.getByRole('button',{name:'내 도구'}).click();
 await world.getByRole('button',{name:'공간 설정·소리'}).click();
 const settings=page.getByRole('dialog',{name:'공간 설정',exact:true});await expect(settings).toBeVisible();
 await expect(settings.getByLabel('소리 크기')).toBeVisible();
 await settings.press('Escape');await expect(settings).toBeHidden();
 await world.getByRole('button',{name:'동료와 대화',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'동료와 대화',exact:true})).toBeVisible();
});
test('lightweight mode retains all task entry points inside the campus',async({page})=>{
 await page.route('**/campus/world/**/index.html*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Slow space</title>'}));
 await page.goto('/space?spatial=1');
 await page.getByRole('button',{name:'가벼운 화면으로 시작',exact:true}).click();
 await page.getByRole('button',{name:'공간 안내',exact:true}).click();
 const guide=page.getByRole('dialog',{name:'공간 안내',exact:true});
 await guide.getByRole('button',{name:'실행 수첩',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'실행 수첩',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'실행 수첩 닫기'}).click();
 await expect(page.getByRole('navigation',{name:'문샷 공간 선택'})).toBeVisible();
});
test('camera toggles announce next view and map resets without a menu detour',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/space?spatial=1');const world=page.frameLocator('iframe'),root=world.locator('#office');await expect(root).toHaveAttribute('data-ready','true',{timeout:90000});
 await world.getByRole('button',{name:'3인칭으로 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','third');await expect(world.getByRole('button',{name:'1인칭으로 보기',exact:true})).toBeVisible();
 await world.getByRole('button',{name:'1인칭으로 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','first');await expect(world.getByRole('button',{name:'3인칭으로 보기',exact:true})).toBeVisible();
 await world.getByRole('button',{name:'내 도구',exact:true}).click();await world.getByRole('button',{name:'전체 지도',exact:true}).click();await expect(world.locator('#space-guide')).toBeHidden();await expect(root).toHaveAttribute('data-camera-mode','overall');await expect(world.getByRole('button',{name:'수업·과제',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('lesson window only shows chosen lesson and its contextual task',async({page})=>{
 await page.goto('/space?spatial=1&section=learning');const window=page.getByRole('dialog',{name:'수업·과제',exact:true});await expect(window.getByRole('button',{name:'보완 의견 확인하기',exact:true})).toBeVisible();await expect(window.getByRole('button',{name:'집중 시작',exact:true})).toHaveCount(0);await expect(window.getByRole('button',{name:/성장 기록/})).toHaveCount(0);
 await window.getByLabel('수업 선택').selectOption({index:4});await expect(window.getByRole('button',{name:'수업 이어보기',exact:true})).toBeVisible();await expect(window.getByRole('button',{name:'보완 의견 확인하기',exact:true})).toHaveCount(0);await window.getByRole('button',{name:'수업·과제 닫기'}).click();await expect(window).toBeHidden();await expect(page.getByRole('button',{name:'동료와 함께하기',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
