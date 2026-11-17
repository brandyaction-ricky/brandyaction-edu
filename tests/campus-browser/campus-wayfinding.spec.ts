import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test.setTimeout(90000);
test('guest follows reachable library arrows and can exit without hiding existing controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/campus/operator-access',r=>r.fulfill({json:{allowed:false}}));
 const source=fs.readFileSync('public/campus/world/tour/library-wayfinding.mjs','utf8');
 await page.route('**/tour/library-wayfinding.mjs',r=>r.fulfill({contentType:'text/javascript',body:source.replace('return mesh;',"document.body.dataset.libraryArrows=String(libraryTrail.length);return mesh;")}));
 await page.goto('/webinar?library=1');await expect(page.getByText(/바닥의 파란 화살표/)).toBeVisible();await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click();
 const world=page.frameLocator('iframe'),root=world.locator('#office');await expect(world.locator('body')).toHaveAttribute('data-library-arrows','6');await expect(root).toHaveAttribute('data-room','live');
 const exit=page.getByRole('button',{name:'캠퍼스 나가기',exact:true});await expect(exit).toBeVisible();
 const boxes=await page.locator('header[data-campus-chrome] button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
 for(let i=0;i<boxes.length;i++){const b=boxes[i];expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(page.viewportSize()!.width);if(i)expect(b.x).toBeGreaterThanOrEqual(boxes[i-1].right);}
 await page.screenshot({path:test.info().outputPath('library-arrows-exit.png')});
 await page.getByRole('button',{name:'공간 전체 보기',exact:true}).click();
 await world.getByRole('button',{name:'문샷 자료실',exact:true}).click();await expect(root).toHaveAttribute('data-room','library');await page.getByRole('button',{name:'자료·다시보기',exact:true}).click();await expect(page.getByText('검수용 무료 자료',{exact:true})).toBeVisible();await page.getByRole('button',{name:'자료·다시보기 닫기',exact:true}).click();
 await page.getByRole('button',{name:'공간 이동',exact:true}).click();await page.getByRole('button',{name:'문샷 웰컴 존 입장',exact:true}).click();await expect(page.getByRole('dialog',{name:'공간 입장 안내'})).toBeVisible();await page.getByRole('button',{name:'공간 입장 안내 닫기'}).click();
 await exit.click();await expect(page).toHaveURL(/\/$/);expect(errors).toEqual([]);
});
test('verified operator uses the authorized room route directly instead of the guest offer',async({page})=>{
 await page.route('**/api/campus/operator-access',r=>r.fulfill({json:{allowed:true}}));
 await page.route('**/campus/operator?**',r=>r.fulfill({contentType:'text/html',body:'<h1>Operator destination</h1>'}));
 await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click();await page.getByRole('button',{name:'공간 이동',exact:true}).click();await expect(page.getByText(/현재 권한: 관리자/)).toBeVisible();await page.getByRole('button',{name:'문샷 웰컴 존 입장',exact:true}).click();await expect(page).toHaveURL(/\/campus\/operator\?room=welcome&event=/);await expect(page.getByRole('heading',{name:'Operator destination'})).toBeVisible();
});
