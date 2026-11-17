import {test,expect} from '@playwright/test';
test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});

test('original lighting and independent recorded tracks work without autoplay or shared storage',async({page},info)=>{
 test.setTimeout(90000);
 const errors:string[]=[],audioRequests:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().endsWith('.m4a'))audioRequests.push(r.url());if(/blob\.vercel|\/api\/study|redis/.test(r.url()))external.push(r.url());});
 await page.goto('/space');
 const frame=page.frameLocator('iframe'),root=frame.locator('#office');
 await expect(root).toHaveAttribute('data-ready','true',{timeout:30000});
 expect(audioRequests).toEqual([]);
 await page.getByRole('button',{name:'조명·배경음 열기',exact:true}).click();
 const dialog=frame.getByRole('dialog',{name:'조명·배경음',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByLabel('공간 조명').selectOption('night');await expect(root).toHaveAttribute('data-lighting','night');
 await dialog.getByRole('switch',{name:'빗소리 재생',exact:true}).check();
 await dialog.getByRole('switch',{name:'키보드 타건 소리 재생',exact:true}).check();
 await expect(dialog.locator('.ambient-track[data-state="playing"]')).toHaveCount(2);
 await dialog.getByLabel('빗소리 볼륨',{exact:true}).fill('40');await expect(dialog.getByLabel('키보드 타건 소리 볼륨',{exact:true})).toHaveValue('25');
 await dialog.evaluate(el=>{el.scrollTop=0;});await page.locator('iframe').scrollIntoViewIfNeeded();
 await dialog.screenshot({path:test.info().outputPath('lighting-mixer-'+info.project.name+'.png')});
 await dialog.getByRole('button',{name:'조명·배경음 닫기'}).click();await expect(root).not.toHaveAttribute('inert','');
 await frame.getByRole('button',{name:'내 사무공간',exact:true}).click();await expect(root).toHaveAttribute('data-room','office',{timeout:30000});
 await frame.getByRole('button',{name:'조명·배경음',exact:true}).click();
 await expect(dialog.locator('.ambient-track[data-state="playing"]')).toHaveCount(2);
 await dialog.getByRole('button',{name:'모든 소리 끄기'}).click();await expect(dialog.locator('.ambient-track[data-state="playing"]')).toHaveCount(0);
 await page.reload();await expect(root).toHaveAttribute('data-ready','true',{timeout:30000});await expect(root).toHaveAttribute('data-lighting','night');
 await page.getByRole('button',{name:'조명·배경음 열기',exact:true}).click();
 await expect(dialog.getByLabel('빗소리 볼륨',{exact:true})).toHaveValue('40');
 await expect(dialog.getByRole('switch',{name:'빗소리 재생',exact:true})).not.toBeChecked();
 expect(external).toEqual([]);expect(errors).toEqual([]);
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});

test('six original props can be picked on the rendered campus floor',async({page},info)=>{
 test.skip(info.project.name!=='desktop','The hit map uses mouse hover before a physical pointer click.');test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/campus-tour');
 const frame=page.frameLocator('iframe'),root=frame.locator('#office');
 const rooms=[{id:'study',name:'문샷 공부방',items:{'study-arcade':'미니 아케이드 · 100점','study-water-plant':'식물에 물을 줬습니다.','study-telescope':'달을 향해 망원경을 맞췄습니다.'}},{id:'office',name:'내 AI 사무실',items:{'office-coffee':'커피 한 잔, 준비됐습니다.','office-globe':'작은 지구를 한 바퀴 돌려봅니다.','office-mini-rocket':'3, 2, 1. 미니 로켓 발사!'}}];
 for(const room of rooms){
  const map=page.getByRole('dialog',{name:'공간 이동',exact:true});if(!await map.isVisible())await page.getByRole('button',{name:'공간 이동',exact:true}).click();await map.getByRole('button',{name:room.name+' 입장',exact:true}).click();await expect(root).toHaveAttribute('data-room',room.id,{timeout:60000});
  // Discover the real mesh hit regions at this viewport without reaching into the renderer or assuming pixel coordinates.
  const points=await root.evaluate((el,ids)=>{const found:Record<string,{x:number;y:number}>={};const b=el.getBoundingClientRect();for(const stride of [21,7])for(let y=10;y<b.height;y+=stride)for(let x=10;x<b.width;x+=stride){const t=document.elementFromPoint(b.left+x,b.top+y);if(!t||!el.contains(t))continue;t.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:b.left+x,clientY:b.top+y}));const id=(el as HTMLElement).dataset.interiorHover;if(id&&ids.includes(id)&&!found[id])found[id]={x,y};if(Object.keys(found).length===ids.length)return found;}return found;},Object.keys(room.items));
  for(const [id,message] of Object.entries(room.items)){expect(points[id],id).toBeDefined();await root.click({position:points[id]});await expect(frame.locator('#status')).toHaveText(message);}
 }
 expect(errors).toEqual([]);
});

test('main campus exposes the original controls only in member rooms and pauses audio outside them',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/campus-tour');const frame=page.frameLocator('iframe'),root=frame.locator('#office');
 const enter=async(name:string)=>{const map=page.getByRole('dialog',{name:'공간 이동',exact:true});if(!await map.isVisible())await page.getByRole('button',{name:'공간 이동',exact:true}).click();await map.getByRole('button',{name:name+' 입장',exact:true}).click();};
 await enter('문샷 공부방');await expect(root).toHaveAttribute('data-room','study',{timeout:60000});
 await frame.getByRole('button',{name:'조명·배경음',exact:true}).click();
 const dialog=frame.getByRole('dialog',{name:'조명·배경음',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByLabel('공간 조명').selectOption('night');await expect(root).toHaveAttribute('data-lighting','night');
 await dialog.getByRole('switch',{name:'빗소리 재생',exact:true}).check();await expect(dialog.locator('.ambient-track[data-state="playing"]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'조명·배경음 닫기'}).click();
 await enter('내 AI 사무실');await expect(root).toHaveAttribute('data-room','office');
 await frame.getByRole('button',{name:'조명·배경음',exact:true}).click();await expect(dialog.locator('.ambient-track[data-state="playing"]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'조명·배경음 닫기'}).click();
 await enter('문샷 라이브홀');await expect(root).toHaveAttribute('data-room','live');await expect(frame.locator('#environment-open')).toBeHidden();await expect(root).toHaveAttribute('data-lighting','bright');
 await expect(frame.locator('.ambient-track[data-state="playing"]')).toHaveCount(0);
 await enter('문샷 공부방');await frame.getByRole('button',{name:'조명·배경음',exact:true}).click();await expect(dialog.locator('.ambient-track[data-state="playing"]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'모든 소리 끄기'}).click();await expect(dialog.locator('.ambient-track[data-state="playing"]')).toHaveCount(0);
 expect(errors).toEqual([]);
});
