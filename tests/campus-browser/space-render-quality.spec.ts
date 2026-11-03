import {test,expect} from '@playwright/test';

test.use({launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}});

test('measured software rendering load reduces GPU work while camera and a nonblank photo remain usable',async({page},info)=>{
 test.skip(info.project.name==='mobile','CPU-throttled software rendering is measured once on desktop; mobile controls have their own checks.');
 test.setTimeout(60000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const cpu=await page.context().newCDPSession(page);
 // Apply real CPU scheduling pressure. No browser/automation checks or synthetic frame costs enter app code.
 try{
  await page.goto('/space');await page.getByLabel('공간 화면',{exact:true}).selectOption('classic');
  const world=page.frameLocator('iframe[title="문샷 우주선 3D 공간"]');
  await expect(world.locator('#ms-loading')).toBeHidden({timeout:20000});
  await cpu.send('Emulation.setCPUThrottlingRate',{rate:8});
  await page.getByRole('button',{name:'3인칭',exact:true}).click();
  await world.locator('canvas').press('w',{delay:1600});
  await expect(world.locator('canvas')).toHaveAttribute('data-render-quality',/^(balanced|light)$/,{timeout:15000});
  const ratio=Number(await world.locator('canvas').getAttribute('data-render-pixel-ratio'));
  expect(ratio).toBeLessThanOrEqual(1);
  await cpu.send('Emulation.setCPUThrottlingRate',{rate:1});
  await page.getByRole('button',{name:'3인칭',exact:true}).click();
  await page.getByRole('button',{name:'전체 지도',exact:true}).click();
  await page.getByRole('button',{name:'기념 사진 저장',exact:true}).click();
  const download=page.getByRole('link',{name:'기념 사진 PNG 내려받기'});
  // Software GPU recovery after CPU pressure can exceed the default 5s on CI.
  await expect(download).toHaveAttribute('href',/^data:image\/png;base64,/,{timeout:15000});
  const image=Buffer.from((await download.getAttribute('href'))!.split(',')[1],'base64');
  const {default:sharp}=await import('sharp');
  expect((await sharp(image).stats()).channels.some(c=>c.stdev>5)).toBeTruthy();
  expect(errors).toEqual([]);
 }finally{await cpu.send('Emulation.setCPUThrottlingRate',{rate:1});await cpu.detach();}
});
