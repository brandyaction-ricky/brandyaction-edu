import { expect, test, type Page } from '@playwright/test';
const cohort = '11111111-1111-4111-8111-111111111111', lesson = '22222222-2222-4222-8222-222222222222', asOf = '2026-10-08T08:00:00Z';
const cell = (state: string, n = 0) => ({ lessonId: n ? 'learning-' + n : lesson, title: n ? '학습 ' + n : '나의 첫 미션', week: 1, day: n || 1, track: n ? 'learning' : 'daily', state, published: state !== 'scheduled', completedAt: state === 'completed' ? '2026-10-07T08:00:00Z' : null, submittedAt: null, reviewedAt: null, submissionId: null, reason: '' });
const rows = ['not_submitted','submitted','changes_requested','completed'].map((state,i)=>({enrollmentId:'enrollment-'+i,memberId:'33333333-3333-4333-8333-'+String(i).padStart(12,'0'),name:['가상 지민','가상 수빈','가상 민준','가상 유나'][i],email:'qa'+i+'@example.test',cells:[cell(state),cell('completed',1),cell('scheduled',2)],lastVisitAt:'2026-10-07T08:00:00Z',lastContactAt:i===2?'2026-10-08T07:00:00Z':null,openQuestions:i===0?1:0}));
const snapshot={cohorts:[{id:cohort,name:'4기 · 합성 데이터',courseTitle:'문샷 테스트'}],cohortId:cohort,rows,asOf};
async function backend(page:Page,fail=false) {
 const sent: Record<string,unknown>[]=[];
 await page.route('**/api/admin/member-conversation**',r=>r.fulfill({json:{rows:[],nextCursor:null}}));
 await page.route('**/api/admin/learning-care**',async r=>{
  if(r.request().method()==='POST'){sent.push(r.request().postDataJSON());await r.fulfill({json:{count:1}});return;}
  await r.fulfill({status:fail?503:200,json:fail?{error:'합성 조회 실패'}:snapshot});
 });
 await page.route('**/api/member/learning-care',r=>r.fulfill({json:{asOf,rows:[{...rows[2],courseTitle:'문샷 테스트',cohortName:'합성 기수'}]}}));
 return{sent,recover:()=>{fail=false;}};
}
test('student and DAY views show actual statuses, safe recipient selection and reviewed send',async({page})=>{
 const {sent}=await backend(page);await page.goto('/learning-care-test');
 await expect(page.getByRole('heading',{name:'수강생 현황'})).toBeVisible();await expect(page.getByText('4개 수강 기록')).toBeVisible();
 await page.getByRole('button',{name:'가상 지민',exact:true}).click();await expect(page.getByRole('region',{name:'수강생 상세'})).toContainText('나의 첫 미션');
 await page.getByRole('button',{name:'상세 닫기'}).click();await page.getByRole('tab',{name:'DAY별'}).click();
 await expect(page.getByRole('checkbox',{name:'가상 수빈 안내 선택'})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'가상 민준 안내 선택'})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'가상 유나 안내 선택'})).toBeDisabled();
 await page.getByRole('checkbox',{name:'가상 지민 안내 선택'}).check();await page.getByRole('button',{name:'선택한 1명 안내 준비'}).click();
 await expect(page.getByRole('region',{name:'학습 안내 확인'})).toContainText('가상 지민');expect(sent).toHaveLength(0);
 await expect(page.getByRole('tab',{name:'수강생별'})).toBeDisabled();
 await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();await expect(page.getByRole('status',{name:'안내 발송 결과'})).toContainText('1명에게 학습 안내를 보냈습니다');expect(sent).toHaveLength(1);expect(sent[0].recipients).toEqual([rows[0].memberId]);expect(sent[0].lessonId).toBe(lesson);
});
test('search and filters cover full cohort, share view and saved PNG omit private data',async({page})=>{
 await backend(page);await page.goto('/learning-care-test');await page.getByPlaceholder('이름 또는 이메일').fill('수빈');await expect(page.getByText('1개 수강 기록')).toBeVisible();
 await page.getByRole('tab',{name:'공유용 요약'}).click();const share=page.getByRole('region',{name:'개인정보 없는 공유용 요약'});await expect(share).toContainText('함께하는 수강생');await expect(share).not.toContainText('가상 수빈');await expect(page.locator('body')).not.toContainText('qa1@example.test');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'공유 이미지 저장'}).click();expect((await download).suggestedFilename()).toBe('brandy-edu-learning-summary.png');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('personal next step links to returned mission and own growth; errors never become zero progress',async({page})=>{
 const api=await backend(page,true);await page.goto('/learning-care-test');await expect(page.getByRole('alert')).toContainText('합성 조회 실패');await expect(page.getByText('0명',{exact:true})).toHaveCount(0);api.recover();await page.getByRole('button',{name:'다시 불러오기'}).click();await expect(page.getByText('4개 수강 기록')).toBeVisible();
 await page.goto('/member-learning-care-test');await expect(page.getByRole('heading',{name:'지금 할 일'})).toBeVisible();await expect(page.getByRole('link',{name:'피드백 확인하기'})).toHaveAttribute('href','/learn/enrollment-2/'+lesson);await expect(page.getByText('+1개 완료')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('uncertain send retains its exact request and disables edits until the receipt is recovered',async({page})=>{
 await backend(page);const attempts:Record<string,unknown>[]=[];
 await page.route('**/api/admin/learning-care',async(route)=>{
  if(route.request().method()==='GET'){await route.fulfill({json:snapshot});return;}
  attempts.push(route.request().postDataJSON());await route.fulfill(attempts.length===1?{status:503,json:{error:'발송 결과를 확인하지 못했습니다.'}}:{json:{count:1}});
 });
 await page.goto('/learning-care-test');await page.getByRole('tab',{name:'DAY별'}).click();await page.getByRole('button',{name:'안내 가능한 대상 선택 · 최대 100명'}).click();await page.getByRole('button',{name:'선택한 1명 안내 준비'}).click();await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();
 await expect(page.getByRole('alert')).toContainText('발송 결과를 확인하지 못했습니다');await expect(page.getByRole('textbox',{name:'안내 내용',exact:true})).toBeDisabled();await page.getByRole('button',{name:'같은 요청으로 결과 확인'}).click();await expect(page.getByRole('status',{name:'안내 발송 결과'})).toContainText('1명에게');expect(attempts).toHaveLength(2);expect(attempts[0]).toEqual(attempts[1]);
});
