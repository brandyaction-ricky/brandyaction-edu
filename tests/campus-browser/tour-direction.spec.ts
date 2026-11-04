import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('movement follows screen left/right and forward/back after changing and rotating cameras',async({page,isMobile})=>{
 test.setTimeout(120000);
 const source=fs.readFileSync('public/campus/world/tour/view-controls.mjs','utf8');
 await page.route('**/campus/world/tour/view-controls.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace('root.dataset.cameraMode=mode;',"root.dataset.testRight=JSON.stringify([office.camera.matrixWorld.elements[0],office.camera.matrixWorld.elements[2]]);root.dataset.testForward=JSON.stringify([-office.camera.matrixWorld.elements[8],-office.camera.matrixWorld.elements[10]]);root.dataset.cameraMode=mode;")}));
 await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 const world=page.frameLocator('iframe'),root=world.locator('#office');await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','overall');
 const point=async()=>[Number(await root.getAttribute('data-player-x')),Number(await root.getAttribute('data-player-y'))];
 for(const button of ['3인칭으로 보기','1인칭으로 보기','공간 전체 보기']){
  await page.getByRole('button',{name:button,exact:true}).click();
  await expect(root).toHaveAttribute('data-camera-mode',button==='3인칭으로 보기'?'third':button==='1인칭으로 보기'?'first':'overall');
  for(const rotated of [false,true]){
   if(rotated){const box=(await root.boundingBox())!;await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+100,box.y+box.height*.5,{steps:8});await page.mouse.up();await page.waitForTimeout(700);}
   for(const [direction,key,axis,sign]of [['left','a','testRight',-1],['right','d','testRight',1],['up','w','testForward',1],['down','s','testForward',-1]] as const){
    const basis=JSON.parse((await root.getAttribute('data-'+axis.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())))!) as number[];
    const before=await point();
    if(isMobile){const b=(await world.locator(`[data-direction=${direction}]`).boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.waitForTimeout(240);await page.mouse.up();}
    else{await root.focus();await page.keyboard.down(key);await page.waitForTimeout(240);await page.keyboard.up(key);}
    await page.waitForTimeout(100);const after=await point();
    const projected=(after[0]-before[0])*basis[0]+(after[1]-before[1])*basis[1];
    expect(projected*sign,`${button}, rotated=${rotated}, ${direction}`).toBeGreaterThan(.05);
   }
  }
 }
});
