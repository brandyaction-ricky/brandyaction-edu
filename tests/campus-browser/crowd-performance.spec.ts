import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {startCrowdVisitors} from '../campus-fixture/crowd-visitors.mjs';
test('mobile crowd uses eight shared draws and keeps movement frames bounded',async({page,baseURL},info)=>{
 test.skip(info.project.name!=='mobile','Mobile rendering budget is measured once.');test.setTimeout(120000);
 let browserSession:Record<string,string>|undefined;
 page.on('response',async r=>{if(r.url().endsWith('/api/campus/preview-meetup')&&r.request().method()==='POST'&&r.request().postDataJSON()?.kind==='join')browserSession=await r.json();});
 const visitors=await startCrowdVisitors(baseURL,60,{socialGroups:true,animate:true}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const source=fs.readFileSync('public/campus/world/tour/tour.mjs','utf8');
 await page.route('**/campus/world/tour/tour.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace('original();root.dataset.playerX',"const cpuStart=performance.now();original();(window.__qaCosts ||= []).push(performance.now()-cpuStart);root.dataset.gpuCalls=String(office.gl.info.render.calls);(window.__qaFrames ||= []).push(performance.now());if(window.__qaFrames.length>600)window.__qaFrames.shift();root.dataset.playerX")}));
 const crowdSource=fs.readFileSync('public/campus/world/tour/crowd-renderer.mjs','utf8');
 await page.route('**/campus/world/tour/crowd-renderer.mjs',r=>r.fulfill({contentType:'text/javascript',body:crowdSource.replace('office.scene.add(group);','office.scene.add(group);window.__qaCrowdVisible=value=>{group.visible=value;};')}));
 try{
  await page.goto('/webinar?meet=1');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});const world=page.frameLocator('iframe'),root=world.locator('#office');
  await expect(root).toHaveAttribute('data-crowd-count','40');await expect(world.locator('.meetup-population')).toContainText('가상 검수 60명');
  await page.screenshot({path:'/private/tmp/campus-crowd-entry-mobile.png'});
  const renderer=await root.getAttribute('data-gpu-renderer');const withCrowd=Number(await root.getAttribute('data-gpu-calls'));
  await root.evaluate(()=>{(window as unknown as {__qaCrowdVisible:(v:boolean)=>void}).__qaCrowdVisible(false);});await page.waitForTimeout(2500);
  const withoutCrowd=Number(await root.getAttribute('data-gpu-calls'));expect(withCrowd-withoutCrowd).toBe(8);
  await root.evaluate(()=>{(window as unknown as {__qaCrowdVisible:(v:boolean)=>void}).__qaCrowdVisible(true);(window as unknown as {__qaFrames:number[]}).__qaFrames=[];(window as unknown as {__qaCosts:number[]}).__qaCosts=[];});
  const button=(await world.locator('[data-direction=right]').boundingBox())!;await page.mouse.move(button.x+button.width/2,button.y+button.height/2);await page.mouse.down();await page.waitForTimeout(8000);await page.mouse.up();
  const result=await root.evaluate(()=>{const f=(window as unknown as {__qaFrames:number[]}).__qaFrames;const intervals=f.slice(1).map((t,i)=>t-f[i]).sort((a,b)=>a-b);const costs=(window as unknown as {__qaCosts:number[]}).__qaCosts.sort((a,b)=>a-b);return{cpuP95Ms:costs[Math.floor(costs.length*.95)],draws:f.length,p95Ms:intervals[Math.floor(intervals.length*.95)],maxMs:Math.max(...intervals)};});
  expect(result.draws).toBeLessThanOrEqual(245);expect(result.draws).toBeGreaterThan(80);expect(result.p95Ms).toBeLessThan(120);expect(result.maxMs).toBeLessThan(600);expect(errors).toEqual([]);expect(visitors.motionStats.errors).toBe(0);expect(visitors.motionStats.maxMoving).toBeGreaterThan(0);expect(visitors.motionStats.maxMoving).toBeLessThanOrEqual(15);if(renderer?.includes('Metal')){expect(result.draws).toBeGreaterThan(200);expect(result.p95Ms).toBeLessThan(60);}
  fs.writeFileSync('/private/tmp/crowd-performance.json',JSON.stringify({...result,motion:visitors.motionStats,renderer,withCrowd,withoutCrowd,scope:'Local Chromium phone emulation; see renderer backend; not physical device FPS'}));
  await info.attach('local-mobile-emulation-rendering-only',{body:JSON.stringify({...result,motion:visitors.motionStats,renderer,withCrowd,withoutCrowd,scope:'Local Chromium phone emulation; NOT physical phone FPS or Internet capacity'}),contentType:'application/json'});
  await page.screenshot({path:'/private/tmp/campus-crowd-60-mobile.png'});await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();await page.screenshot({path:'/private/tmp/campus-natural-map-mobile.png'});
 }finally{if(browserSession)await visitors.post({...browserSession,kind:'leave'}).catch(()=>{});await page.close();await visitors.stop();}
});
