import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});

test('imported world loads locally; movement, camera, EDU seat and fallback work',async({page},info)=>{
 test.setTimeout(90000);
 const errors:string[]=[],unexpected:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/\/api\/study|\/api\/feedback|brandy-ai-office|blob\.vercel|redis/.test(r.url()))unexpected.push(r.url());});
 await page.goto('/space');await expect(page.getByLabel('공간 화면',{exact:true})).toHaveValue('office');
 const world=page.frameLocator('iframe[title="문샷 우주선 3D 공간"]');
 await expect(world.locator('#office')).toHaveAttribute('data-ready','true',{timeout:30000});
 // Capture real child -> host position messages; no renderer internals are faked.
 await page.evaluate(()=>{(window as typeof window & {moves:unknown[]}).moves=[];window.addEventListener('message',e=>{if(e.data?.type==='position')(window as typeof window & {moves:unknown[]}).moves.push(e.data.payload);});});
 await page.getByRole('button',{name:'동료와 함께하기',exact:true}).click();
 await expect(page.getByRole('button',{name:'동료 연결 끊기',exact:true})).toBeVisible();
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
 await page.goto('/space');await expect(page.getByLabel('공간 화면',{exact:true})).toHaveValue('office');
 const world=page.frameLocator('iframe');await expect(world.locator('#office')).toHaveAttribute('data-ready','true',{timeout:30000});
 await world.getByRole('button',{name:'내 사무공간',exact:true}).click();
 await expect(world.locator('#office')).toHaveAttribute('data-room','office',{timeout:30000});await expect(world.locator('#status')).toContainText('실제 AI 직원 연결은 준비 중');
 await world.getByRole('button',{name:'문샷 공부방',exact:true}).click();await expect(world.locator('#office')).toHaveAttribute('data-room','study',{timeout:30000});
 await world.getByRole('button',{name:'내 AI 사무실',exact:true}).click();
 await expect(page.getByRole('heading',{name:'새 작업 요청',exact:true})).toBeVisible();
 await page.goto('/campus/world/office/index.html');
 await expect(page.locator('#status')).toContainText('에듀 캠퍼스 화면에서');
 await expect(page.locator('canvas')).toHaveCount(0);
});

test('original twelve character models, palette and props preview, save and reopen without changing permissions',async({page},info)=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/space');await expect(page.getByLabel('공간 화면',{exact:true})).toHaveValue('office');
 const world=page.frameLocator('iframe[title="문샷 우주선 3D 공간"]');await expect(world.locator('#office')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.getByRole('button',{name:'동료와 함께하기',exact:true}).click();await expect(page.getByRole('button',{name:'동료 연결 끊기',exact:true})).toBeVisible();
 await world.getByRole('button',{name:'캐릭터 꾸미기',exact:true}).click();const dialog=world.getByRole('dialog',{name:'캐릭터 꾸미기',exact:true});await expect(dialog).toBeVisible();
 for(const gender of ['male','female']){await dialog.getByLabel('캐릭터 유형',{exact:true}).selectOption(gender);for(let model=0;model<6;model++){await dialog.getByLabel('외형 스타일',{exact:true}).selectOption(String(model));await expect(world.locator('#avatar-preview')).toHaveAttribute('data-model',`${gender}:${model}`);}}
 await dialog.getByLabel('캐릭터 유형',{exact:true}).selectOption('male');await dialog.getByLabel('외형 스타일',{exact:true}).selectOption('0');await dialog.getByLabel('닉네임',{exact:true}).fill('문샷 동료');
 for(const [label,color] of [['머리','#00465b'],['피부','#63f5ec'],['의상','#262741'],['바지','#425a78']])await dialog.getByLabel(label,{exact:true}).fill(color);
 await dialog.getByLabel('손에 들 소품',{exact:true}).selectOption('book');await expect(world.locator('#avatar-preview canvas')).toBeVisible();await expect(world.locator('#avatar-preview')).toHaveAttribute('data-held-item','book');
 await dialog.evaluate(el=>{el.scrollTop=0;});await page.locator('iframe[title="문샷 우주선 3D 공간"]').scrollIntoViewIfNeeded();
 await dialog.screenshot({path:test.info().outputPath('original-character-'+info.project.name+'.png')});
 await dialog.getByRole('button',{name:'저장하기',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('status').filter({hasText:'캐릭터를 저장했어요'})).toBeVisible();
 await page.reload();await expect(world.locator('#office')).toHaveAttribute('data-ready','true',{timeout:30000});await world.getByRole('button',{name:'캐릭터 꾸미기',exact:true}).click();
 await expect(dialog.getByLabel('피부',{exact:true})).toHaveValue('#63f5ec');await expect(dialog.getByLabel('손에 들 소품',{exact:true})).toHaveValue('book');await expect(dialog.getByLabel('닉네임',{exact:true})).toHaveValue('문샷 동료');
 await dialog.getByLabel('외형 스타일',{exact:true}).selectOption('5');await dialog.getByRole('button',{name:'취소',exact:true}).click();await world.getByRole('button',{name:'캐릭터 꾸미기',exact:true}).click();await expect(dialog.getByLabel('외형 스타일',{exact:true})).toHaveValue('0');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();expect(errors).toEqual([]);
});
