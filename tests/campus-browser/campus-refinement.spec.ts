import {test,expect} from '@playwright/test';
test.setTimeout(120000);
test('operator without enrollment enters every room and keeps avatar controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/operator-tour');
 await expect(page.getByRole('banner').getByText('문샷 웰컴 존',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'공간 전체 보기',exact:true})).toBeEnabled({timeout:90000});
 await expect(page.getByLabel('입장 권한 체험',{exact:true})).toHaveCount(0);
 for(const room of ['문샷 공부방','내 AI 사무실','문샷 자료실','문샷 라이브홀','문샷 웰컴 존']){
  await page.getByRole('button',{name:'공간 이동',exact:true}).click();await page.getByRole('button',{name:room+' 입장',exact:true}).click();
  await expect(page.getByRole('banner').getByText(room,{exact:true})).toBeVisible();await expect(page.getByRole('dialog',{name:'공간 입장 안내',exact:true})).toHaveCount(0);
 }
 await page.getByRole('button',{name:'내 캐릭터',exact:true}).click();await expect(page.frameLocator('iframe').getByRole('dialog',{name:'캐릭터 꾸미기'})).toBeVisible();
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('quiz targets and captions stay aligned through all answers on a phone',async({page})=>{
 await page.goto('/webinar');await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:90000});
 await page.getByRole('button',{name:'이 공간에서 할 일',exact:true}).click();await page.getByRole('button',{name:'고객 발견 체험',exact:true}).click();
 const yes=page.getByRole('button',{name:'O 맞아요',exact:true}),no=page.getByRole('button',{name:'X 아니에요',exact:true});
 const y=(await yes.boundingBox())!,n=(await no.boundingBox())!;expect(Math.abs(y.y-n.y)).toBeLessThan(1);expect(Math.abs(y.width-n.width)).toBeLessThan(1);expect(y.height).toBeGreaterThan(100);
 await page.screenshot({path:test.info().outputPath('quiz-layout.png')});
 for(let i=0;i<3;i++){await (i===1?no:yes).click();await expect(page.getByText('정답이에요!',{exact:true})).toBeVisible();await page.getByRole('button',{name:i===2?'체험 마치기':'다음 질문',exact:true}).click();}
 await expect(page.getByRole('heading',{name:'첫 고객 발견 미션 완료!'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
