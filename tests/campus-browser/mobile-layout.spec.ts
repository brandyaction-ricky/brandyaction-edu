import {test,expect,type Locator} from '@playwright/test';
test.setTimeout(process.env.CI?240000:120000); // Software-rendered CI needs a longer interaction budget; hardware assertions remain unchanged.

async function reachable(locator:Locator){
 await expect(locator).toBeVisible();
 const hit=await locator.evaluate(el=>{const r=el.getBoundingClientRect(),d=el.ownerDocument,w=d.defaultView!;const at=d.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {inside:r.x>=0&&r.y>=0&&r.right<=w.innerWidth+1&&r.bottom<=w.innerHeight+1,hit:!!at&&(at===el||el.contains(at)),height:r.height,width:r.width};});
 expect(hit.inside).toBeTruthy();expect(hit.hit).toBeTruthy();expect(hit.height).toBeGreaterThanOrEqual(44);expect(hit.width).toBeGreaterThanOrEqual(44);
}
for(const [width,height]of [[320,568],[360,640],[390,844],[430,932],[844,390],[768,1024]]){
 test(`phone layout ${width}x${height}: arrival, editor, walking, map and invitation`,async({page,isMobile})=>{
 test.skip(!isMobile,'Touch viewport matrix');await page.setViewportSize({width,height});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/webinar');
 const customize=page.getByRole('button',{name:'캐릭터 꾸미고 입장',exact:true});await expect(customize).toBeEnabled({timeout:90000});await reachable(customize);await customize.click();
 const world=page.frameLocator('iframe'),editor=world.getByRole('dialog',{name:'캐릭터 꾸미기'});await expect(editor).toBeVisible();await reachable(editor.getByRole('button',{name:'저장하기',exact:true}));await reachable(editor.getByRole('button',{name:'취소',exact:true}));
 await editor.getByLabel('닉네임').fill('휴대폰 검수');await editor.getByLabel('외형 스타일').selectOption('2');await editor.getByRole('button',{name:'저장하기',exact:true}).click();await page.getByRole('button',{name:'안내 닫기'}).click();
 for(const name of ['공간 이동','전체화면','공간 전체 보기','1인칭으로 보기','이 공간에서 할 일','내 캐릭터'])await reachable(page.getByRole('button',{name,exact:true}));
 for(const name of ['위로 이동','아래로 이동','왼쪽 이동','오른쪽 이동'])await reachable(world.getByRole('button',{name,exact:true}));
 await expect(world.locator('#office')).toHaveAttribute('data-render-profile',/^(touch|compatibility)$/);
 const status=world.locator('#status');await expect(status).toContainText('바닥 터치');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await page.screenshot({path:test.info().outputPath('phone-campus.png')});
 await page.getByRole('button',{name:'공간 이동',exact:true}).click();const map=page.getByRole('dialog',{name:'공간 이동',exact:true});await reachable(map.getByRole('button',{name:'공간 이동 닫기'}));await map.getByRole('button',{name:'내 AI 사무실 입장',exact:true}).click();
 const gate=page.getByRole('dialog',{name:'공간 입장 안내',exact:true});const link=gate.getByRole('link',{name:'문샷 과정 자세히 보기'});await link.scrollIntoViewIfNeeded();await reachable(link);await reachable(gate.getByRole('button',{name:'공간 입장 안내 닫기'}));await page.screenshot({path:test.info().outputPath('phone-invitation.png')});await gate.getByRole('button',{name:'공간 입장 안내 닫기'}).click();
 await page.getByRole('button',{name:'내 캐릭터',exact:true}).click();await expect(editor.getByLabel('닉네임')).toHaveValue('휴대폰 검수');await reachable(editor.getByRole('button',{name:'저장하기',exact:true}));await editor.getByRole('button',{name:'취소',exact:true}).click();expect(errors).toEqual([]);
 });
}
test('unsupported fullscreen gives a readable explanation instead of a runtime error',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(Element.prototype,'requestFullscreen',{value:undefined,configurable:true});});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});await page.getByRole('button',{name:'전체화면',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'전체화면을 지원하지'})).toBeVisible();expect(errors).toEqual([]);
});

test('phone pinch does not walk and a reduced viewport keeps editor actions reachable',async({page,context,isMobile})=>{
 test.skip(!isMobile,'Touch interaction');await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});const world=page.frameLocator('iframe'),root=world.locator('#office'),cdp=await context.newCDPSession(page);
 const before={camera:await root.getAttribute('data-camera-position'),x:await root.getAttribute('data-player-x'),y:await root.getAttribute('data-player-y')};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:145,y:520,id:1},{x:245,y:520,id:2}]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145-i*6,y:520,id:1},{x:245+i*6,y:520,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(root).not.toHaveAttribute('data-camera-position',before.camera!);await expect(root).toHaveAttribute('data-player-x',before.x!);await expect(root).toHaveAttribute('data-player-y',before.y!);
 const b=(await world.getByRole('button',{name:'오른쪽 이동',exact:true}).boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});await page.waitForTimeout(450);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(root).not.toHaveAttribute('data-player-x',before.x!);
 await page.getByRole('button',{name:'내 캐릭터',exact:true}).click();await page.setViewportSize({width:390,height:350});const editor=world.getByRole('dialog',{name:'캐릭터 꾸미기'});await reachable(editor.getByRole('button',{name:'저장하기',exact:true}));await reachable(editor.getByRole('button',{name:'취소',exact:true}));await editor.getByLabel('닉네임').fill('작은 화면 검수');await editor.getByRole('button',{name:'저장하기',exact:true}).click();await expect(editor).toBeHidden();
});

test('member-space phone footer does not collide with movement or the help label',async({page,isMobile})=>{
 test.skip(!isMobile,'Phone footer');await page.goto('/campus-tour');await page.getByRole('button',{name:'문샷 공부방 입장',exact:true}).click();const world=page.frameLocator('iframe');await expect(page.getByRole('button',{name:'내 캐릭터',exact:true})).toBeEnabled({timeout:90000});const role=page.locator('summary').filter({hasText:'미리보기'});await reachable(role);const footer=(await role.boundingBox())!,pad=(await world.locator('.tour-pad').boundingBox())!,help=(await world.locator('#status').boundingBox())!;expect(pad.y+pad.height).toBeLessThanOrEqual(footer.y);expect(help.y+help.height).toBeLessThanOrEqual(footer.y);await page.screenshot({path:test.info().outputPath('member-phone.png')});
});
