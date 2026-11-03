import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});

test('imported world loads locally; movement, camera, EDU seat and fallback work',async({page},info)=>{
 test.setTimeout(90000);
 const errors:string[]=[],unexpected:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/\/api\/study|\/api\/feedback|brandy-ai-office|blob\.vercel|redis/.test(r.url()))unexpected.push(r.url());});
 await page.goto('/space');await page.getByLabel('공간 화면',{exact:true}).selectOption('office');
 const world=page.frameLocator('iframe[title="문샷 우주선 3D 공간"]');
 await expect(world.locator('#office')).toHaveAttribute('data-ready','true',{timeout:30000});
 // Capture real child -> host position messages; no renderer internals are faked.
 await page.evaluate(()=>{(window as typeof window & {moves:unknown[]}).moves=[];window.addEventListener('message',e=>{if(e.data?.type==='position')(window as typeof window & {moves:unknown[]}).moves.push(e.data.payload);});});
 await page.getByRole('button',{name:'캠퍼스 입장',exact:true}).click();
 await expect(page.getByRole('button',{name:'공간 나가기',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'3인칭',exact:true}).click();
 await expect(world.locator('#office')).toHaveAttribute('data-study-camera','third');
 if(info.project.name==='mobile'){
  const control=world.getByRole('button',{name:'아래로 이동'});await control.scrollIntoViewIfNeeded();const box=(await control.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(1000);await page.mouse.up();
 }else{await world.locator('#office').focus();await page.keyboard.down('s');await page.waitForTimeout(1000);await page.keyboard.up('s');}
 await expect.poll(()=>page.evaluate(()=>(window as typeof window & {moves:unknown[]}).moves.length)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'전체 지도',exact:true}).click();
 await expect(world.locator('#office')).not.toHaveAttribute('data-study-camera','third');
 await page.getByRole('button',{name:'1번 빈자리',exact:true}).click();
 await expect(world.locator('#status')).toContainText('자리에 앉았어요');
 await expect(page.getByRole('button',{name:'자리에서 일어나기',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'자리에서 일어나기',exact:true}).click();
 await page.getByRole('button',{name:'손 흔들기',exact:true}).click();
 await expect(page.getByRole('button',{name:'기념 사진 저장',exact:true})).toBeDisabled();
 await page.getByLabel('공간 화면',{exact:true}).selectOption('classic');
 await expect(world.locator('#ms-loading')).toBeHidden({timeout:20000});
 await expect(page.getByRole('button',{name:'1인칭',exact:true})).toBeVisible();
 expect(errors).toEqual([]);expect(unexpected).toEqual([]);
});

test('world opens existing EDU office and rejects unauthenticated standalone startup',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/space');await page.getByLabel('공간 화면',{exact:true}).selectOption('office');
 const world=page.frameLocator('iframe');await expect(world.locator('#office')).toHaveAttribute('data-ready','true',{timeout:30000});
 await world.getByRole('button',{name:'내 봇 사무실',exact:true}).click();
 await expect(page.getByRole('heading',{name:'새 작업 요청',exact:true})).toBeVisible();
 await page.goto('/campus/world/office/index.html');
 await expect(page.locator('#status')).toContainText('에듀 캠퍼스 화면에서');
 await expect(page.locator('canvas')).toHaveCount(0);
});
