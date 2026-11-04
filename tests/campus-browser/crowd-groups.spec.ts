import {test,expect} from '@playwright/test';
import {startCrowdVisitors} from '../campus-fixture/crowd-visitors.mjs';
test('connected crowd becomes a conversation only after approaching and joining',async({page,baseURL,isMobile})=>{
 test.setTimeout(process.env.CI?240000:120000); // Software-rendered CI needs a longer interaction budget; hardware assertions remain unchanged.
const namespace=test.info().testId;await page.setExtraHTTPHeaders({'x-campus-test-room':namespace});let browserSession:Record<string,string>|undefined;page.on('response',async response=>{if(response.url().endsWith('/api/campus/preview-meetup')&&response.request().method()==='POST'&&response.request().postDataJSON()?.kind==='join')browserSession=await response.json();});const visitors=await startCrowdVisitors(baseURL,20,{animate:true,namespace}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/webinar?meet=1&qaChat=1');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
  const world=page.frameLocator('iframe'),root=world.locator('#office');await expect(root).toHaveAttribute('data-crowd-count','20');await expect(world.locator('.meetup-population')).toContainText('가상 검수 20명');await expect(world.locator('.meetup-join')).toBeHidden();
  if(isMobile){const box=(await world.locator('[data-direction=right]').boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();}else{await root.focus();await page.keyboard.down('d');}
  try{await expect(world.getByRole('button',{name:'가까운 그룹과 대화하기'})).toBeVisible({timeout:10000});}finally{if(isMobile)await page.mouse.up();else await page.keyboard.up('d');}await world.getByRole('button',{name:'가까운 그룹과 대화하기'}).click();
  await expect(root).toHaveAttribute('data-group-joined',visitors.clients[0].session.partition);await expect(root).toHaveAttribute('data-peer-count',isMobile?'12':'20');
  await visitors.post({...visitors.clients[0].session,kind:'update',message:'합류한 동료에게만 보이는 인사'});await expect(world.locator('.meetup-messages')).toContainText('합류한 동료에게만 보이는 인사');
  await world.getByRole('textbox',{name:'동료에게 한마디'}).fill('반가워요! 함께 배워요.');
  await world.getByRole('button',{name:'보내기',exact:true}).click();await expect(world.locator('.meetup-messages')).toContainText('반가워요! 함께 배워요.');await expect(world.getByRole('textbox',{name:'동료에게 한마디'})).toHaveValue('');
  const bounds=await world.locator('.meetup-body').evaluate(el=>{const box=el.getBoundingClientRect(),input=el.querySelector('input')!.getBoundingClientRect(),send=el.querySelector('form button')!.getBoundingClientRect(),leave=el.querySelector('.meetup-leave')!.getBoundingClientRect();return{right:box.right,width:innerWidth,inputBottom:input.bottom,sendBottom:send.bottom,gap:send.left-input.right,footerGap:leave.top-input.bottom,inputWidth:input.width};});
  expect(bounds.right).toBeLessThanOrEqual(bounds.width);expect(Math.abs(bounds.inputBottom-bounds.sendBottom)).toBeLessThan(1);expect(bounds.gap).toBeGreaterThanOrEqual(7);expect(bounds.footerGap).toBeGreaterThanOrEqual(10);expect(bounds.inputWidth).toBeGreaterThan(120);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  await page.screenshot({path:test.info().outputPath('campus-crowd-'+(isMobile?'mobile':'desktop')+'.png')});
  if(isMobile){
   await page.setViewportSize({width:320,height:568});
   const composer=world.getByRole('textbox',{name:'동료에게 한마디'});await composer.fill('좁은 화면에서도 인사해요');
   await expect(world.locator('.meetup-body')).toBeVisible();
   expect(await world.locator('.meetup-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   const rect=await composer.boundingBox();expect(rect!.width).toBeGreaterThan(120);expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(320);
   const panelBox=await world.locator('.meetup-body').boundingBox(),navBox=await page.getByRole('button',{name:'공간 전체 보기',exact:true}).boundingBox();expect(panelBox!.y+panelBox!.height).toBeLessThan(navBox!.y);
   await page.screenshot({path:test.info().outputPath('campus-chat-narrow-mobile.png')});
   await page.setViewportSize({width:844,height:390});
   await composer.fill('가로 화면에서도 인사해요');
   const landscapePanel=await world.locator('.meetup-body').boundingBox(),landscapeNav=await page.getByRole('button',{name:'공간 전체 보기',exact:true}).boundingBox();expect(landscapePanel!.y+landscapePanel!.height).toBeLessThan(landscapeNav!.y);
   await page.screenshot({path:test.info().outputPath('campus-chat-landscape-mobile.png')});
   await page.setViewportSize({width:390,height:844});
  }
  await world.getByRole('button',{name:'대화 나가기',exact:true}).click();await expect(root).toHaveAttribute('data-peer-count','0');await expect(root).toHaveAttribute('data-crowd-count','20');await expect(world.locator('.meetup-body')).toBeHidden();await expect(world.locator('.meetup-toggle')).toHaveAttribute('aria-expanded','false');
 }finally{if(browserSession)await visitors.post({...browserSession,kind:'leave'}).catch(()=>{});await page.close();await visitors.stop();}
});
