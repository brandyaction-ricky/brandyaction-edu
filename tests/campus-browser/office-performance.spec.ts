import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});
test('measure imported office rendering and background suspension',async({page},info)=>{
 test.skip(info.project.name==='mobile','Periodic render budget is measured on desktop; mobile navigation and background behavior have separate checks.');
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const source=fs.readFileSync('public/campus/world/office/bridge.mjs','utf8');
 expect(source.includes('const result=render.apply(this,args)')).toBeTruthy();
 await page.route('**/campus/world/office/bridge.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace('const result=render.apply(this,args)','window.__draws=(window.__draws||0)+1;const result=render.apply(this,args)')}));
 const begin=Date.now();await page.goto('/space?view=immersive');const world=page.frameLocator('iframe');await expect(world.locator('#office')).toHaveAttribute('data-ready','true',{timeout:30000});
 const loadMs=Date.now()-begin;await page.getByRole('button',{name:'캠퍼스 입장',exact:true}).click();await page.waitForTimeout(7000);
 const count=()=>world.locator('body').evaluate(()=>(window as Window&{__draws?:number}).__draws||0);const before=await count();await page.waitForTimeout(30000);const idleDraws=await count()-before;expect(idleDraws).toBeLessThanOrEqual(35);
 await world.locator('#office').press('d',{delay:2000});await page.waitForTimeout(3000);const movingDraws=await count()-before-idleDraws;
 await world.locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const hiddenStart=await count();await page.waitForTimeout(10000);const hiddenDraws=await count()-hiddenStart;expect(hiddenDraws).toBe(0);expect(errors).toEqual([]);
 const result={loadMs,idle30sDraws:idleDraws,moving2sAndSettling3sDraws:movingDraws,hidden10sDraws:hiddenDraws,pageErrors:errors.length,context:'local Chromium SwiftShader synthetic single user; not a concurrency capacity test'};
 fs.writeFileSync(info.outputPath('office-performance.json'),JSON.stringify(result,null,2));await info.attach('office-performance.json',{body:JSON.stringify(result),contentType:'application/json'});
});
