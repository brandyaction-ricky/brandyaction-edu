import {test,expect} from '@playwright/test';
test('Telegram login offers a clean same-site handoff before Google authorization',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,userAgent:'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Telegram/11',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();const outgoing:string[]=[];page.on('request',r=>{if(/accounts.google|\/auth\/v1\/(authorize|settings)/.test(r.url()))outgoing.push(r.url());});
 try{const next='/campus/enter?mode=welcome&event=staff-qa';await page.goto('/public-data-test?publicScreen=login&next='+encodeURIComponent(next));await page.getByRole('button',{name:'Google로 계속하기'}).click();
  const link=page.getByRole('textbox',{name:'외부 브라우저에서 열 입장 주소'});await expect(link).toBeVisible();const url=new URL(await link.inputValue());expect(url.origin).toBe(new URL(baseURL!).origin);expect(url.pathname).toBe('/login');expect(url.searchParams.get('next')).toBe(next);expect([...url.searchParams.keys()]).toEqual(['next']);expect(outgoing).toEqual([]);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('unavailable');}},configurable:true}));await page.getByRole('button',{name:'입장 주소 복사'}).click();await expect(page.getByRole('status')).toContainText('길게 눌러 복사');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await context.close();}
});
test('ordinary browsers still offer manual help without forcing it open',async({page})=>{
 await page.goto('/public-data-test?publicScreen=login&next=%2Fcampus%2Fenter');const help=page.getByText('앱 안에서 열었거나 Google 로그인이 멈추나요?',{exact:true});await expect(help).toBeVisible();await expect(page.getByRole('textbox',{name:'외부 브라우저에서 열 입장 주소'})).toBeHidden();await help.click();await expect(page.getByRole('textbox',{name:'외부 브라우저에서 열 입장 주소'})).toHaveValue(/\/login\?next=%2Fcampus%2Fenter$/);
});
