import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('arrival defaults to third person; stairs raise camera and avatar and gallery edges stop a fall',async({page,isMobile})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const source=fs.readFileSync('public/campus/world/tour/tour.mjs','utf8');
 await page.route('**/tour/tour.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace("group.visible=false;return;", "let invalid=0;group.traverse(o=>{for(const key of ['position','normal'])if(o.geometry?.attributes[key]&&!Array.from(o.geometry.attributes[key].array).every(Number.isFinite))invalid++;});root.dataset.invalidGeometry=String(invalid);group.visible=false;return;")}));
 await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:60000});
 const world=page.frameLocator('iframe'),root=world.locator('#office');
 await expect(root).toHaveAttribute('data-camera-mode','third');await expect(root).toHaveAttribute('data-invalid-geometry','0');
 const start=(await root.getAttribute('data-camera-position'))!.split(',').map(Number);
 if(isMobile){const b=(await world.getByRole('button',{name:'위로 이동',exact:true}).boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();}
 else{await root.focus();await page.keyboard.down('w');}
 try{await expect.poll(async()=>Number(await root.getAttribute('data-player-height')),{timeout:60000}).toBeCloseTo(4.2,1);}
 finally{if(isMobile)await page.mouse.up();else await page.keyboard.up('w');}
 const top=(await root.getAttribute('data-camera-position'))!.split(',').map(Number);expect(top[1]-start[1]).toBeCloseTo(4.2,1);
 await root.focus();await page.keyboard.down('w');await page.waitForTimeout(2000);await page.keyboard.up('w');
 expect(Number(await root.getAttribute('data-player-height'))).toBeCloseTo(4.2,1);expect(Number(await root.getAttribute('data-player-y'))).toBeGreaterThanOrEqual(-1);
 await page.getByRole('button',{name:'1인칭으로 보기',exact:true}).click();await expect(root).toHaveAttribute('data-camera-mode','first');expect(Number((await root.getAttribute('data-camera-position'))!.split(',')[1])).toBeGreaterThan(5);
 expect(errors).toEqual([]);
});
