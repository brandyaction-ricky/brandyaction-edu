import {test,expect} from '@playwright/test';
test('personal bot roster registers independently of seats and preserves the employee after unseating',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/personal-office');
 await page.getByLabel('직원 이름').fill('콘텐츠 기획 담당');await page.getByLabel('텔레그램 봇 주소').fill('https://t.me/moonshot_qa_bot');await page.getByLabel('담당 업무').fill('내 사업의 콘텐츠 아이디어 정리');await page.getByRole('button',{name:'직원 등록하기',exact:true}).click();
 const employee=page.getByRole('article').filter({hasText:'콘텐츠 기획 담당'}),seats=page.getByRole('region',{name:'사무실 좌석',exact:true});
 await expect(employee.getByRole('link',{name:'텔레그램 열기 ↗',exact:true})).toHaveAttribute('href','https://t.me/moonshot_qa_bot');await expect(employee).toContainText('미배치');await expect(seats.getByRole('button',{name:'자리 비우기',exact:true})).toHaveCount(0);
 await employee.getByRole('button',{name:'빈자리에 배치',exact:true}).click();await expect(seats).toContainText('콘텐츠 기획 담당');await expect(page.getByText('자리 1/10',{exact:false})).toBeVisible();await page.screenshot({path:test.info().outputPath('personal-office.png')});
 await seats.getByRole('button',{name:'자리 비우기',exact:true}).click();await expect(page.getByText('자리 0/10',{exact:false})).toBeVisible();await expect(employee).toContainText('미배치');await expect(employee.getByRole('link',{name:'텔레그램 열기 ↗',exact:true})).toBeVisible();await expect(seats.getByRole('button',{name:'자리 비우기',exact:true})).toHaveCount(0);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('several employees register at once, take free desks, and lines that fail stay in the box',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/personal-office');
 await page.getByText('여러 명 한 번에 등록',{exact:true}).click();const box=page.getByLabel('직원 목록 (최대 10명)');
 await box.fill('제 2의 뇌, @moonshot_brain_bot, 자료 정리, 기억\n총괄 관리자\thttps://t.me/moonshot_lead_bot\t전체 조율\n주소 없는 직원\nGEO 담당자, https://t.me/moonshot_geo_bot');
 await page.getByRole('button',{name:'한 번에 등록하고 자리에 앉히기',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('3명을 등록하고 3명을 자리에 앉혔어요.');await expect(page.getByRole('status')).toContainText('3번째 줄');await expect(box).toHaveValue('주소 없는 직원');
 const seats=page.getByRole('region',{name:'사무실 좌석',exact:true}).getByRole('listitem');
 await expect(seats.nth(0)).toContainText('총괄 관리자 자리');await expect(seats.nth(0).getByRole('strong')).toHaveText('총괄 관리자');await expect(seats.nth(1)).toContainText('제 2의 뇌');await expect(seats.nth(2)).toContainText('GEO 담당자');
 await expect(page.getByText('자리 3/10',{exact:false})).toBeVisible();await expect(page.getByRole('article').filter({hasText:'제 2의 뇌'})).toContainText('자료 정리, 기억');
 await box.fill('GEO 담당자, @moonshot_geo_bot\n광고 담당자, @moonshot_ads_bot');await page.getByRole('button',{name:'한 번에 등록하고 자리에 앉히기',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('1명을 등록하고 1명을 자리에 앉혔어요.');await expect(box).toHaveValue('');await expect(page.getByText('자리 4/10',{exact:false})).toBeVisible();
 page.once('dialog',d=>void d.accept());await page.getByRole('article').filter({hasText:'GEO 담당자'}).getByRole('button',{name:'직원 삭제',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('‘GEO 담당자’을(를) 직원 목록에서 삭제했어요.');await expect(page.getByRole('article').filter({hasText:'GEO 담당자'})).toHaveCount(0);await expect(page.getByText('자리 3/10',{exact:false})).toBeVisible();
 await page.screenshot({path:test.info().outputPath('bulk-register.png'),fullPage:true});expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('campus analytics displays real denominators, empty states and clear action definitions on mobile',async({page})=>{
 await page.route('**/api/admin/campus/analytics?**',r=>r.fulfill({json:{sessions:12,activeSeconds:360,trackingEnabled:true,rooms:[{room:'library',visitors:8,entries:10,clicks:16,avg_active_seconds:45,intent_sessions:2}],actions:[{action:'resource_download',count:5,sessions:3}],resources:[],scopes:[]}}));await page.goto('/campus-analytics');await expect(page.getByRole('heading',{name:'문샷 캠퍼스 분석'})).toBeVisible();const row=page.getByRole('row').filter({has:page.getByRole('rowheader',{name:'자료실',exact:true})});await expect(row).toContainText('25.0%');await expect(row).toContainText('0분 45초');await page.getByText('지표 정의·수집 범위',{exact:true}).click();await expect(page.getByText(/다운로드 요청은 기기 저장 완료/)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('campus-analytics.png')});
});
