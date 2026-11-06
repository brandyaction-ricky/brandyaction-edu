// Opt-in integration QA. Requires the loopback fixture + an independently started signed gateway.
// This validates real browser/HTTP/SSE transport, with synthetic Auth/event dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const enabled=process.env.CAMPUS_GATEWAY_BROWSER_QA==='true';
test('desktop + mobile viewport: remote peers, reactions, movement, reconnect, renewal and event closure',{skip:!enabled,timeout:180000},async()=>{
 const browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const aContext=await browser.newContext({viewport:{width:1280,height:900}}),bContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const a=await aContext.newPage(),b=await bContext.newPage();const errors=[];let admissions=0,joins=0;
 const base='http://127.0.0.1:4586';
 const wait=async(fn,timeout=15000)=>{const until=Date.now()+timeout;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,250));}assert.fail('condition timed out');};
 try{
  await a.request.post(base+'/__gateway-test/status?open=true&admin=true',{headers:{origin:base}});
  for(const page of [a,b]){
   await page.addInitScript(()=>window.addEventListener('message',event=>{
    if(event.data?.type==='dev-visitor-state')window.__gatewayPeers=(event.data.payload?.people||[]).map(p=>({x:p.x,y:p.y}));
   }));
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(page===a&&r.url().endsWith('/api/campus/realtime-admission')&&r.ok())admissions++;});
   page.on('request',r=>{if(page===a&&r.url()==='http://127.0.0.1:8787/api/campus/realtime'&&r.method()==='POST'&&r.postDataJSON()?.kind==='join')joins++;});
   await page.goto(base+'/webinar-gateway');
   await page.getByRole('button',{name:'이 캐릭터로 바로 입장',exact:true}).click({timeout:60000});
  }
  const wa=a.frameLocator('iframe'),wb=b.frameLocator('iframe');
  await wait(async()=>await wa.locator('#office').getAttribute('data-dev-peer-count')==='1');
  await wait(async()=>await wb.locator('#office').getAttribute('data-dev-peer-count')==='1');
  await wa.getByRole('button',{name:'인사와 반응 열기'}).click();
  await wa.getByRole('button',{name:'👋 안녕하세요',exact:true}).click();
  await wait(async()=>(await wb.locator('#office').getAttribute('data-peer-reactions')||'').includes('hello'));
  const remotePosition=()=>b.frames()[1].evaluate(()=>JSON.stringify(window.__gatewayPeers));
  const previousRemote=await remotePosition();
  const before=await wa.locator('#office').getAttribute('data-player-y');
  await wa.locator('#office').focus();await a.keyboard.down('w');await a.waitForTimeout(800);await a.keyboard.up('w');
  await wait(async()=>await wa.locator('#office').getAttribute('data-player-y')!==before);
  await wait(async()=>await remotePosition()!==previousRemote);
  console.log('Peer rendering, selected reaction and remote movement passed.');
  const joinBefore=joins;await aContext.setOffline(true);await a.waitForTimeout(3000);await aContext.setOffline(false);
  await wait(async()=>admissions>=2,20000);
  await wait(async()=>await wa.locator('#office').getAttribute('data-dev-peer-count')==='1');
  assert.equal(joins,joinBefore,'reconnect should preserve the session during grace');
  console.log('Same-session network reconnect passed.');
  const admissionBefore=admissions;await wait(async()=>admissions>admissionBefore,75000);
  await wait(async()=>await wa.locator('#office').getAttribute('data-dev-peer-count')==='1');
  assert.equal(joins,joinBefore,'renewal should not duplicate the connection');
  await a.getByRole('button',{name:'공간 이동',exact:true}).click();
  await a.getByRole('button',{name:'문샷 자료실 입장',exact:true}).click();
  await wait(async()=>await wa.locator('#office').getAttribute('data-dev-peer-count')==='0');
  await wait(async()=>await wb.locator('#office').getAttribute('data-dev-peer-count')==='0');
  await b.getByRole('button',{name:'공간 이동',exact:true}).click();
  await b.getByRole('button',{name:'문샷 자료실 입장',exact:true}).click();
  await wait(async()=>await wa.locator('#office').getAttribute('data-dev-peer-count')==='1');
  await wait(async()=>await wb.locator('#office').getAttribute('data-dev-peer-count')==='1');
  console.log('Renewal and live/library separation passed.');
  await a.request.post(base+'/__gateway-test/status?open=false',{headers:{origin:base}});
  await wait(async()=>await wa.locator('#office').getAttribute('data-dev-peer-count')==='0',75000);
  await wait(async()=>await wb.locator('#office').getAttribute('data-dev-peer-count')==='0',10000);
  assert.deepEqual(errors,[]);
  console.log('QA passed: two browsers, reaction, remote movement, room isolation, same-session reconnect/renewal, closed-event disconnect.');
 }finally{await a.request.post(base+'/__gateway-test/status?open=true&admin=true',{headers:{origin:base}}).catch(()=>{});await browser.close();}
});
