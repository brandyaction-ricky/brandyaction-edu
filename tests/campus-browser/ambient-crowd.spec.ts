import {test,expect} from '@playwright/test';
test.setTimeout(120000);
test('operating ambience uses original characters without network presence or inflated attendance',async({page,isMobile})=>{
 const calls:string[]=[];page.on('request',r=>{if(r.url().includes('/api/campus/preview-meetup'))calls.push(r.url());});await page.goto('/webinar?ambient=40');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 const world=page.frameLocator('iframe[title="문샷 캠퍼스 3D 미리보기"]'),root=world.locator('#office');await expect(root).toHaveAttribute('data-crowd-model','original-avatar');await expect.poll(async()=>Number(await root.getAttribute('data-crowd-actors'))).toBeGreaterThan(10);expect(Number(await root.getAttribute('data-crowd-count'))).toBeLessThanOrEqual(isMobile?40:80);await expect(world.getByText('공간 안내 캐릭터가 함께 있어요.',{exact:false})).toBeVisible();await expect(world.getByText(/실제 접속 40명/)).toHaveCount(0);await expect(world.getByText('공간 내 캐릭터 41명',{exact:true})).toBeVisible();await expect(world.getByRole('combobox')).toHaveCount(0);await expect(world.locator('.visitor-count')).toHaveCount(0);expect(calls).toEqual([]);
 await page.screenshot({path:test.info().outputPath('ambient-crowd.png')});
 await page.goto('/webinar?ambient=0');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});await expect(root).not.toHaveAttribute('data-crowd-model','original-avatar');
});
