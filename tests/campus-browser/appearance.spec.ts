import {test,expect,type Locator} from '@playwright/test';

async function readable(control:Locator){
 const ratio=await control.evaluate(el=>{
  const rgb=(s:string)=>s.match(/[\d.]+/g)!.map(Number);
  const luminance=(c:number[])=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  let background=[255,255,255];const ancestors:Element[]=[];let current:Element|null=el;
  while(current){ancestors.unshift(current);current=current.parentElement;}
  for(const node of ancestors){const c=rgb(getComputedStyle(node).backgroundColor),alpha=c[3]??1;background=background.map((b,i)=>c[i]*alpha+b*(1-alpha));}
  const foreground=rgb(getComputedStyle(el).color);return(Math.max(luminance(foreground),luminance(background))+.05)/(Math.min(luminance(foreground),luminance(background))+.05);
 });expect(ratio,'control text must remain legible on its actual background').toBeGreaterThanOrEqual(4.5);
}

test('entry links stay readable and aligned on desktop and phone',async({page})=>{
 await page.route('**/api/admin/campus/webinars*',r=>r.fulfill({json:{events:[],cohorts:[{id:'00000000-0000-4000-8000-000000000003',name:'3기',courses:{title:'문샷',slug:'moonshot'}}]}}));
 await page.goto('/webinar-admin');await page.addStyleTag({content:'body{background:#080e1e}'});await page.getByRole('button',{name:'새 행사 만들기'}).click();await page.getByLabel('연결할 교육 기수').selectOption('00000000-0000-4000-8000-000000000003');
 await readable(page.getByLabel('공개 상태'));await readable(page.getByLabel('제목',{exact:true}));await page.getByRole('navigation',{name:'관리 항목'}).getByRole('button',{name:'입장 링크',exact:true}).click();
 const hub=page.getByRole('region',{name:'대상별 캠퍼스 입장 링크'});
 for(const control of await hub.locator('button,a').all()){await readable(control);expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});

test('workspace navigation and journal controls have explicit readable text',async({page})=>{
 await page.goto('/workspace');
 await readable(page.getByLabel('학습 공간 기수'));
 for(const control of await page.getByRole('navigation',{name:'문샷 기능'}).getByRole('button').all())await readable(control);
 await page.getByRole('button',{name:'실행 수첩',exact:true}).click();await readable(page.getByRole('button',{name:'실행 기록 새로고침'}));
});

test('saved night desk keeps labels, timer and inputs readable',async({page})=>{
 await page.goto('/space');await page.getByRole('button',{name:'동료와 함께하기',exact:true}).click();
 await page.getByLabel('공간 화면',{exact:true}).selectOption('classic');
 await page.getByRole('tab',{name:'내 자리',exact:true}).click();await page.getByLabel('내 집중 책상 분위기',{exact:true}).selectOption('night');await page.getByRole('button',{name:'내 자리 저장',exact:true}).click();
 await page.getByRole('tab',{name:'집중과 휴식',exact:true}).click();
 await readable(page.getByLabel('집중 시간',{exact:true}));await readable(page.getByLabel('나만 보는 메모',{exact:true}));await readable(page.getByLabel('집중 타이머',{exact:true}));await readable(page.getByRole('heading',{name:'오늘은 무엇을 만들까요?'}));
 await page.reload();await readable(page.getByLabel('나만 보는 메모',{exact:true}));
});
