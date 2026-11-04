import {test,expect} from '@playwright/test';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const contacts=[{orderId:id(2),orderNumber:'BAE-SYNTHETIC-001',name:'결제자 샘플',email:'buyer@example.test',phone:'01012345678',status:'paid'}];
const member={id:id(1),full_name:'가입자 샘플',email:'account@example.test',status:'active',role:'student',created_at:'2026-10-06T00:00:00Z',paymentContacts:contacts};
test('member search resets pagination, keeps submitted query across reload and shows both identities',async({page},info)=>{
 const reads:URL[]=[];
 await page.route('**/api/admin/diagnosis/erasures**',r=>r.fulfill({json:{rows:[],nextCursor:null,enabled:false}}));
 await page.route('**/api/platform?**',async route=>{const url=new URL(route.request().url());reads.push(url);const q=url.searchParams.get('memberQuery')||'',p=Number(url.searchParams.get('page')||1);await route.fulfill({json:{user:{id:id(99),full_name:'합성 관리자',role:'admin'},data:{profiles:q==='missing'?[]:q?[member]:Array.from({length:2},(_,n)=>({...member,id:id(n+20+p*2),full_name:`회원 ${n+p*2}`,paymentContacts:[]})),courses:[],member_summary:[{id:'s',active:102,suspended:0,marketing:0}]},pagination:{page:p,pageSize:2,total:q==='missing'?0:q?1:102}}});});
 await page.goto('/admin/customers?navigationFixture&memberDirectoryFixture');
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await expect.poll(()=>reads.filter(u=>u.searchParams.get('section')==='customers').at(-1)?.searchParams.get('page')).toBe('2');
 const search=page.getByRole('searchbox',{name:'회원 관리 목록 검색',exact:true});await search.fill('buyer@example.test');await search.press('Enter');
 await expect(page).toHaveURL(/memberQuery=buyer/);await expect.poll(()=>reads.filter(u=>u.searchParams.get('section')==='customers').at(-1)?.searchParams.get('page')).toBe('1');
 await expect(page.getByRole('button',{name:'가입자 샘플',exact:true})).toBeVisible();await expect(page.getByText('가입 이메일: account@example.test')).toBeVisible();
 await page.getByText('결제자: 결제자 샘플 (1건)',{exact:true}).click();await expect(page.getByText('결제 이메일: buyer@example.test')).toBeVisible();await expect(page.getByText('BAE-SYNTHETIC-001 · 결제 완료')).toBeVisible();
 await page.screenshot({path:info.outputPath('member-identities.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await expect(page.getByRole('searchbox',{name:'회원 관리 목록 검색',exact:true})).toHaveValue('buyer@example.test');await expect(page.getByRole('button',{name:'가입자 샘플',exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'회원 관리 목록 검색',exact:true}).fill('missing');await page.getByRole('button',{name:'전체 회원 검색',exact:true}).click();await expect(page.getByText('조회된 항목이 없습니다.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'검색·필터 초기화',exact:true}).click();await expect(page.getByRole('searchbox',{name:'회원 관리 목록 검색',exact:true})).toHaveValue('');expect(new URL(page.url()).searchParams.has('memberQuery')).toBe(false);
});
test('N6 search supports payment email, displays identities and links to the exact member',async({page})=>{
 await page.route('**/api/platform?**',r=>r.fulfill({json:{user:{id:id(99),role:'admin'},data:{}}}));const queries:string[]=[];
 await page.route('**/api/admin/diagnosis**',r=>{queries.push(r.request().url());return r.fulfill({json:{enabled:true,allPublished:true,revision:1,eligibleCount:1,startedCount:0,nextCursor:null,remoteAvailable:true,rows:[{id:member.id,name:member.full_name,email:member.email,paymentContacts:contacts,published:true,state:'not_started',attemptId:null,report:null,statusAvailable:true}]}});});
 await page.goto('/diagnosis-test?manage');await page.getByRole('textbox',{name:'수강생 검색'}).fill('buyer@example.test');await page.getByRole('button',{name:'검색',exact:true}).click();await expect.poll(()=>new URL(queries.at(-1)!).searchParams.get('query')).toBe('buyer@example.test');
 await expect(page.getByRole('link',{name:'가입자 샘플',exact:true})).toHaveAttribute('href',`/admin/customers?member=${member.id}`);await page.getByText('결제자: 결제자 샘플 (1건)',{exact:true}).click();await expect(page.getByText('결제 이메일: buyer@example.test')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
