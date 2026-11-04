import {test,expect} from '@playwright/test';

test('nearby avatar budget and reconnect preserve the assigned session',async({page,isMobile})=>{
 test.setTimeout(120000);let joins=0,resumes=0;
 await page.route('**/api/campus/preview-meetup',async route=>{
  const data=route.request().postDataJSON();if(data.kind==='join')joins++;if(data.kind==='resume')resumes++;
  await route.fulfill({json:data.kind==='join'?{id:'self',ticket:'a'.repeat(48),partition:'qa'}:{ok:true}});
 });
 await page.addInitScript(()=>{
  // Synthetic transport only: the production renderer still creates real avatar meshes.
  class TestStream {
   onmessage:((e:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;timer:ReturnType<typeof setInterval>;
   constructor(){
    (window as unknown as {dropPeers:()=>void}).dropPeers=()=>this.onerror?.();
    this.timer=setInterval(()=>this.onmessage?.({data:JSON.stringify({self:'self',room:'live',partition:'qa',roomCount:25,totalCount:1000,peers:Array.from({length:24},(_,i)=>({id:'peer-'+i,x:(i%6)-3,y:20+Math.floor(i/6),yaw:0,moving:false,appearance:{nickname:'동료 '+i,gender:'male',model:0,coat:'#386eb4'}}))})}),500);
   }
   close(){clearInterval(this.timer);}
  }
  Object.defineProperty(window,'EventSource',{value:TestStream});
 });
 await page.goto('/webinar?meet=1&qaChat=1');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 const world=page.frameLocator('iframe'),root=world.locator('#office');
 await expect(root).toHaveAttribute('data-peer-count',isMobile?'12':'24');
 await expect(root).toHaveAttribute('data-total-count','1000');
 await expect(world.locator('.meetup-toggle')).toContainText('내 그룹 25명');
 await root.evaluate(()=>{(window as unknown as {dropPeers:()=>void}).dropPeers();});
 await expect(root).toHaveAttribute('data-peer-count',isMobile?'12':'24',{timeout:10000});
 await expect.poll(()=>resumes).toBeGreaterThan(0);expect(joins).toBe(1);
 await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','overall');
 const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);expect(fits).toBe(true);
});

test('capacity response keeps exploration, controls and course entry usable',async({page,isMobile})=>{
 test.setTimeout(120000);
 await page.route('**/api/campus/preview-meetup',route=>route.fulfill({status:503,json:{error:'capacity',retryAfterMs:5000}}));
 await page.goto('/webinar?meet=1&qaChat=1');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 const world=page.frameLocator('iframe'),root=world.locator('#office');
 await expect(world.locator('.meetup-toggle')).toContainText('둘러보기 가능');
 const before=Number(await root.getAttribute('data-player-x'));
 if(isMobile){const button=(await world.locator('[data-direction=right]').boundingBox())!;await page.mouse.move(button.x+button.width/2,button.y+button.height/2);await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();}
 else{await root.focus();await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.up('d');}
 await expect.poll(async()=>Math.abs(Number(await root.getAttribute('data-player-x'))-before)).toBeGreaterThan(.05);
 await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','overall');
 await page.getByRole('button',{name:'공간 이동',exact:true}).click();await page.getByRole('button',{name:'문샷 공부방 입장',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'공간 입장 안내',exact:true})).toBeVisible();
 await expect(root).toHaveAttribute('data-room','live');
});

test('a stalled admission request times out while the scene stays interactive',async({page},info)=>{
 test.skip(info.project.name==='mobile','Transport timeout is shared; mobile overload and controls are covered separately.');test.setTimeout(120000);
 await page.route('**/api/campus/preview-meetup',()=>new Promise<void>(()=>{}));
 await page.goto('/webinar?meet=1&qaChat=1');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 const world=page.frameLocator('iframe');
 await expect(world.locator('.meetup-toggle')).toContainText('둘러보기 가능',{timeout:12000});
 await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();await expect(world.locator('#office')).toHaveAttribute('data-camera-mode','overall');
});
