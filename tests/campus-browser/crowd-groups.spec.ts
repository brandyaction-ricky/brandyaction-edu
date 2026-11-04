import {test,expect} from '@playwright/test';
import {startCrowdVisitors} from '../campus-fixture/crowd-visitors.mjs';
test('connected crowd becomes a conversation only after approaching and joining',async({page,baseURL,isMobile})=>{
 test.setTimeout(120000);let browserSession:Record<string,string>|undefined;page.on('response',async response=>{if(response.url().endsWith('/api/campus/preview-meetup')&&response.request().method()==='POST'&&response.request().postDataJSON()?.kind==='join')browserSession=await response.json();});const visitors=await startCrowdVisitors(baseURL,20),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/webinar?meet=1');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
  const world=page.frameLocator('iframe'),root=world.locator('#office');await expect(root).toHaveAttribute('data-crowd-count','20');await expect(world.locator('.meetup-population')).toContainText('가상 검수 20명');await expect(world.locator('.meetup-join')).toBeHidden();
  if(isMobile){const box=(await world.locator('[data-direction=right]').boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(550);await page.mouse.up();}else{await root.focus();await page.keyboard.down('d');await page.waitForTimeout(550);await page.keyboard.up('d');}
  await expect(world.getByRole('button',{name:'가까운 그룹과 대화하기'})).toBeVisible();await world.getByRole('button',{name:'가까운 그룹과 대화하기'}).click();
  await expect(root).toHaveAttribute('data-group-joined',visitors.clients[0].session.partition);await expect(root).toHaveAttribute('data-peer-count',isMobile?'12':'20');
  await visitors.post({...visitors.clients[0].session,kind:'update',message:'합류한 동료에게만 보이는 인사'});await expect(world.locator('.meetup-messages')).toContainText('합류한 동료에게만 보이는 인사');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:'/private/tmp/campus-crowd-'+(isMobile?'mobile':'desktop')+'.png'});
  await world.getByRole('button',{name:'대화 나가기',exact:true}).click();await expect(root).toHaveAttribute('data-peer-count','0');await expect(root).toHaveAttribute('data-crowd-count','20');await expect(world.locator('.meetup-body')).toBeHidden();await expect(world.locator('.meetup-toggle')).toHaveAttribute('aria-expanded','false');
 }finally{if(browserSession)await visitors.post({...browserSession,kind:'leave'}).catch(()=>{});await page.close();await visitors.stop();}
});
