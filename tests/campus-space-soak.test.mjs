import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {readFileSync,writeFileSync} from 'node:fs';import {chromium} from 'playwright';import {tmpdir} from 'node:os';import {join} from 'node:path';
// Opt-in slow check. No Supabase, credentials, staff records or external networks.
// CAMPUS_SPACE_SOAK=1 node --test tests/campus-space-soak.test.mjs
const enabled=process.env.CAMPUS_SPACE_SOAK==='1';
test('ten minute local two-tab 3D soak measures rendering, bounded moves, re-entry and study-clock persistence',{skip:!enabled,timeout:700000},async()=>{
 const port=Number(process.env.CAMPUS_SOAK_PORT||4523),origin=`http://127.0.0.1:${port}`,duration=600000;
 const server=spawn(process.execPath,['tests/campus-fixture/server.mjs'],{env:{...process.env,CAMPUS_QA_PORT:String(port)},stdio:['ignore','pipe','pipe']});let serverLog='';server.stderr.on('data',v=>serverLog+=v.toString());
 let browser;const errors=[],requests=[],blocked=[],samples=[];let peerReentries=0,ownerReentries=0;
 try{
 for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===99)throw Error('Fixture failed: '+serverLog);}
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{window.__spaceSoak={frames:0,raf:0,moves:0,broadcast:0,buckets:{}};const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>{window.__spaceSoak.raf++;return raf(fn);};window.addEventListener('message',e=>{if(e.data?.source==='moonshot-world'&&e.data.type==='position'){window.__spaceSoak.moves++;const second=Math.floor(performance.now()/1000);window.__spaceSoak.buckets[second]=(window.__spaceSoak.buckets[second]||0)+1;}});const send=BroadcastChannel.prototype.postMessage;BroadcastChannel.prototype.postMessage=function(value){window.__spaceSoak.broadcast++;return send.call(this,value);};});
 const source=readFileSync('public/campus/world/src/app.js','utf8');const instrumented=source.replace('renderer.render(scene,camera);','window.__spaceSoak.frames++;renderer.render(scene,camera);');assert.notEqual(source,instrumented);
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());requests.push({method:req.method(),path:url.pathname});if(url.origin!==origin){blocked.push(url.origin);return route.abort();}if(url.pathname==='/campus/world/src/app.js')return route.fulfill({contentType:'text/javascript',body:instrumented});return route.continue();});
 const page=await context.newPage(),peer=await context.newPage();for(const p of[page,peer])p.on('pageerror',e=>errors.push(e.message));
 const enter=async(p)=>{await p.goto(origin+'/space');await p.getByRole('button',{name:'동료와 함께하기',exact:true}).click();await p.frameLocator('iframe[title="문샷 우주선 3D 공간"]').locator('#ms-loading').waitFor({state:'hidden',timeout:30000});};
 await enter(page);await enter(peer);await peer.getByRole('button',{name:'가벼운 공간 메뉴',exact:true}).click();await page.bringToFront();await page.getByRole('button',{name:'집중 시작',exact:true}).click();
 const start=Date.now();let cycle=0,last=0;
 while(Date.now()-start<duration){
  cycle++;const world=page.frameLocator('iframe[title="문샷 우주선 3D 공간"]');await page.getByRole('button',{name:'3인칭',exact:true}).click();const canvas=world.locator('canvas');await canvas.scrollIntoViewIfNeeded();await canvas.focus();
  const movingStart=await world.locator('body').evaluate(()=>({...window.__spaceSoak}));const t=Date.now();await page.keyboard.down(cycle%2?'KeyD':'KeyA');await page.waitForTimeout(4000);await page.keyboard.up(cycle%2?'KeyD':'KeyA');const movingEnd=await world.locator('body').evaluate(()=>({...window.__spaceSoak}));const movingMs=Date.now()-t;
  let hiddenFrames=null;if(cycle%2===0){await world.locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const before=await world.locator('body').evaluate(()=>window.__spaceSoak.frames);await page.waitForTimeout(8000);hiddenFrames=(await world.locator('body').evaluate(()=>window.__spaceSoak.frames))-before;assert.equal(hiddenFrames,0);await world.locator('body').evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});}
  await page.waitForTimeout(2000);const idleStart=await world.locator('body').evaluate(()=>window.__spaceSoak.frames);await page.waitForTimeout(8000);const idleFrames=(await world.locator('body').evaluate(()=>window.__spaceSoak.frames))-idleStart;
  if(cycle%3===0){await peer.getByRole('button',{name:'동료 연결 끊기',exact:true}).click();await enter(peer);await peer.getByRole('button',{name:'가벼운 공간 메뉴',exact:true}).click();peerReentries++;await page.bringToFront();}
  const host=await page.evaluate(()=>({...window.__spaceSoak,maxMovesPerSecond:Math.max(0,...Object.values(window.__spaceSoak.buckets))}));const timer=await page.getByLabel('집중 타이머',{exact:true}).textContent();assert.notEqual(timer,'25:00');assert.ok(host.maxMovesPerSecond<=3,'At most 2Hz plus one bucket-boundary event');
  samples.push({elapsedSeconds:Math.round((Date.now()-start)/1000),cycle,movingFps:Number(((movingEnd.frames-movingStart.frames)/(movingMs/1000)).toFixed(2)),movingFrames:movingEnd.frames-movingStart.frames,movingWindowSeconds:Number((movingMs/1000).toFixed(2)),idleFrames,idleWindowSeconds:8,hiddenFrames,host,timer});
  if(cycle%5===0){await page.getByRole('button',{name:'동료 연결 끊기',exact:true}).click();await enter(page);ownerReentries++;assert.notEqual(await page.getByLabel('집중 타이머',{exact:true}).textContent(),'25:00');}
  writeFileSync(join(tmpdir(),'campus-space-soak-progress.json'),JSON.stringify({localOnly:true,elapsedSeconds:Math.round((Date.now()-start)/1000),cycles:cycle,errors,peerReentries,ownerReentries,latest:samples.at(-1)},null,2));
  // Each cycle reserves idle time; elapsed time is wall clock, never a fake timer.
  const remaining=30000-(Date.now()-start-last);if(remaining>0)await page.waitForTimeout(Math.min(remaining,Math.max(0,duration-(Date.now()-start))));last=Date.now()-start;
 }
 const result={sample:'10 minute local Chromium two-tab demo soak; no real Realtime or database',elapsedSeconds:Math.round((Date.now()-start)/1000),cycles:cycle,errors,blockedExternalOrigins:blocked,nonGetRequests:requests.filter(r=>r.method!=='GET'),requestCount:requests.length,peerReentries,ownerReentries,samples};writeFileSync(join(tmpdir(),'campus-space-soak-result.json'),JSON.stringify(result,null,2));
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert.equal(result.nonGetRequests.length,0);assert.ok(peerReentries>=4);assert.ok(ownerReentries>=2);
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
});
