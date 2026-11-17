import {test,expect} from '@playwright/test';
test('spatial HUD rejects selection while character nickname and activity content stay usable',async({page,context,isMobile,browserName})=>{
 test.setTimeout(120000);await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});const world=page.frameLocator('iframe'),root=world.locator('#office'),count=world.locator('.visitor-population');
 await expect(count).toBeVisible();expect(await count.evaluate(el=>{const s=getComputedStyle(el);return s.userSelect||s.getPropertyValue('-webkit-user-select');})).toBe('none');
 expect(await count.evaluate(el=>!el.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true})))).toBe(true);
 expect(await count.evaluate(el=>!el.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})))).toBe(true);
 await page.getByRole('button',{name:'내 캐릭터',exact:true}).click();const input=world.getByLabel('닉네임',{exact:true});await input.fill('휴대폰 동료');expect(await input.evaluate(el=>el.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true})))).toBe(true);await world.getByRole('button',{name:'저장하기',exact:true}).click();
 await world.getByRole('button',{name:'인사와 반응 열기',exact:true}).click();await world.getByRole('button',{name:'👋 안녕하세요',exact:true}).click();await expect(root).toHaveAttribute('data-own-reaction','hello');
 if(isMobile&&browserName==='chromium'){const box=(await root.boundingBox())!,before=await root.getAttribute('data-camera-position');const session=await context.newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.width*.55,y:box.height*.55}]});for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.width*.55+i*10,y:box.height*.55}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(root).not.toHaveAttribute('data-camera-position',before!);await session.detach();}
 expect(await page.evaluate(()=>({x:scrollX,overflow:document.documentElement.scrollWidth>innerWidth+1}))).toEqual({x:0,overflow:false});
 await page.getByRole('button',{name:'공간 이동',exact:true}).click();await expect(page.getByRole('dialog',{name:'공간 이동',exact:true})).toBeVisible();
});
