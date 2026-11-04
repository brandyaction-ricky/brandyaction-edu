import {test,expect} from '@playwright/test';
test('visitors explore clearly marked example conversations without free chat',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:80000});const world=page.frameLocator('iframe');
 await expect(world.getByRole('textbox',{name:'동료에게 한마디'})).toHaveCount(0);
 const expand=world.getByRole('button',{name:'체험 안내 열기',exact:true});if(await expand.isVisible())await expand.click();
 await expect(world.getByText('수업 속 대화 예시 · 자유 채팅은 사용하지 않아요.')).toBeVisible();
 await world.getByRole('button',{name:/체험 대화에 합류하기/}).click();
 await expect(page.getByText('수업 속 대화 예시 · 실제 참여자 발언이나 수강 후기가 아닙니다.')).toBeVisible();
 await expect(page.getByRole('link',{name:/문샷 과정 자세히 보기/})).toBeVisible();await expect(page.getByRole('link',{name:/카카오 채널로 문의하기/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath('campus-visitor-story-'+test.info().project.name+'.png')});
});
