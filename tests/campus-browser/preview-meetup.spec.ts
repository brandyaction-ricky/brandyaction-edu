import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('opt-in local visitors see each other, chat and leave without entering member rooms',async({browser,baseURL},info)=>{
 test.skip(info.project.name==='mobile','This test creates its own independent desktop and phone contexts.');
 test.setTimeout(120000);
 const desktop=await browser.newContext({viewport:{width:1440,height:1000}});
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 try{
  const a=await desktop.newPage(),b=await phone.newPage(),errors:string[]=[];
  for(const [page,name]of [[a,'동료 A'],[b,'동료 B']] as const){
   page.on('pageerror',e=>errors.push(e.message));
   const source=fs.readFileSync('public/campus/world/tour/tour.mjs','utf8');
   expect(source).toContain('drawScene();meetup?.labels?.();root.dataset.playerX');
   await page.route('**/campus/world/tour/tour.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace('drawScene();meetup?.labels?.();root.dataset.playerX','window.__tourDraws=(window.__tourDraws||0)+1;drawScene();meetup?.labels?.();root.dataset.playerX')}));
   // Capture the first actual GL draw, before Office.ready (three frames).
   // Applying the pixel/shadow budget after ready stalls a second software-rendered client.
   await page.addInitScript(()=>{
    const draw=WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements=function(...args){
     const canvas=this.canvas as HTMLCanvasElement;
     if(canvas.classList?.contains('office-gl')&&!canvas.hasAttribute('data-first-render-pixels'))canvas.setAttribute('data-first-render-pixels',String(canvas.width*canvas.height));
     return draw.apply(this,args);
    };
   });
   await page.goto(baseURL+'/webinar?meet=1&qaChat=1');
   await page.getByRole('button',{name:'캐릭터 꾸미고 입장',exact:true}).click({timeout:90000});
   const world=page.frameLocator('iframe');
   if(await world.locator('#office').getAttribute('data-render-profile')==='compatibility'){
    const initialPixels=Number(await world.locator('.office-gl').getAttribute('data-first-render-pixels'));
    expect(initialPixels).toBeGreaterThan(0);expect(initialPixels).toBeLessThanOrEqual(200001);
   }
   await world.getByLabel('닉네임').fill(name);
   await world.getByRole('button',{name:'저장하기',exact:true}).click();
   await expect(world.getByRole('dialog',{name:'캐릭터 꾸미기'})).toBeHidden();
   if(page===a){
    await expect(world.locator('#office')).toHaveAttribute('data-total-count','1');
    await page.waitForTimeout(2500);
    const draws=()=>world.locator('body').evaluate(()=>(window as Window&{__tourDraws?:number}).__tourDraws||0);
    const before=await draws();await page.waitForTimeout(7000);
    expect(await draws()-before,'Unchanged live presence must settle to idle rendering').toBeLessThanOrEqual(9);
   }
  }
  const wa=a.frameLocator('iframe'),wb=b.frameLocator('iframe');
  await expect(wa.locator('#office')).toHaveAttribute('data-peer-count','1');
  await expect(wb.locator('#office')).toHaveAttribute('data-peer-count','1');
  await wb.locator('.meetup-toggle').click();await wb.getByLabel('동료에게 한마디').fill('함께 실행해요');
  await wb.getByRole('button',{name:'보내기',exact:true}).click();await wa.locator('.meetup-toggle').click();
  await expect(wa.locator('.meetup-messages')).toContainText('함께 실행해요');
  await b.getByRole('button',{name:'공간 이동',exact:true}).click();
  await b.getByRole('button',{name:'문샷 공부방 입장',exact:true}).click();
  await expect(b.getByRole('dialog',{name:'공간 입장 안내',exact:true})).toBeVisible();
  await expect(wb.locator('#office')).toHaveAttribute('data-room','live');
  await b.close();await expect(wa.locator('#office')).toHaveAttribute('data-peer-count','0');
  expect(errors).toEqual([]);
 }finally{await desktop.close();await phone.close();}
});

test('member preview joins the selected study room and never shares a personal office',async({browser,baseURL},info)=>{
 test.skip(info.project.name==='mobile','Independent contexts cover room isolation once.');test.setTimeout(120000);
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 try{
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  for(const page of pages){await page.goto(baseURL+'/campus-tour?meet=1');await page.getByRole('button',{name:'문샷 공부방 입장',exact:true}).click();await expect(page.getByRole('button',{name:'내 캐릭터',exact:true})).toBeEnabled({timeout:90000});}
  for(const page of pages)await expect(page.frameLocator('iframe').locator('#office')).toHaveAttribute('data-peer-count','1',{timeout:15000});
  for(const page of pages){await page.getByRole('button',{name:'공간 이동',exact:true}).click();await page.getByRole('button',{name:'내 AI 사무실 입장',exact:true}).click();await expect(page.frameLocator('iframe').locator('#office')).toHaveAttribute('data-room','office');}
  for(const page of pages){await expect(page.frameLocator('iframe').locator('#office')).toHaveAttribute('data-peer-count','0');await expect(page.frameLocator('iframe').locator('.meetup-toggle')).toContainText('비공개');}
 }finally{for(const context of contexts)await context.close();}
});
