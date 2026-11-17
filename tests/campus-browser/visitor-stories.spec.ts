import {test,expect} from '@playwright/test';
test('visitor chooses a greeting on their own avatar without opening a guide or free chat',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:80000});const world=page.frameLocator('iframe'),root=world.locator('#office');
 await expect(world.getByRole('textbox',{name:'동료에게 한마디'})).toHaveCount(0);
 await world.getByRole('button',{name:'인사와 반응 열기',exact:true}).click();
 await expect(world.getByRole('button',{name:/대단해요/})).toHaveCount(0);
 const hello=world.locator('[data-reaction=hello]');await hello.click();
 await expect(root).toHaveAttribute('data-own-reaction','hello');await expect(hello).toBeDisabled();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(world.locator('.visitor-reaction-feedback')).toContainText('안녕하세요');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath('campus-reactions-'+test.info().project.name+'.png')});
 await expect(root).toHaveAttribute('data-own-reaction','',{timeout:8000});await expect(hello).toBeEnabled();
 await world.getByRole('button',{name:'인사와 반응 열기',exact:true}).click();await world.getByRole('button',{name:'🚀 문샷 좋아요',exact:true}).click();await expect(root).toHaveAttribute('data-own-reaction','moonshot');
 await expect(hello).toBeHidden();await expect(world.getByRole('button',{name:'인사와 반응 열기',exact:true})).toBeVisible();
});
