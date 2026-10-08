import { expect, test, type Page } from '@playwright/test';
const cohort = '11111111-1111-4111-8111-111111111111', lesson = '22222222-2222-4222-8222-222222222222', asOf = '2026-10-08T08:00:00Z';
const cell = (state: string, n = 0) => ({ lessonId: n ? 'learning-' + n : lesson, title: n ? '학습 ' + n : '나의 첫 학습', week: 1, day: n || 1, track: 'learning', state, published: state !== 'scheduled', completedAt: state === 'completed' ? '2026-10-07T08:00:00Z' : null, submittedAt: null, reviewedAt: null, submissionId: null, reason: '' });
const rows = ['not_submitted','submitted','changes_requested','completed'].map((state,i)=>({enrollmentId:'enrollment-'+i,memberId:'33333333-3333-4333-8333-'+String(i).padStart(12,'0'),name:['가상 지민','가상 수빈','가상 민준','가상 유나'][i],email:'qa'+i+'@example.test',cells:[cell(state),cell('completed',1),cell('scheduled',2),{...cell('error'),lessonId:'separate-mission',title:'제외할 별도 미션',track:'daily'}],lastVisitAt:'2026-10-07T08:00:00Z',lastContactAt:i===2?'2026-10-08T07:00:00Z':null,openQuestions:i===0?1:0}));
const snapshot={cohorts:[{id:cohort,name:'4기 · 예시 화면',courseTitle:'문샷 테스트'}],cohortId:cohort,rows,asOf};
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
 await page.getByRole('tab',{name:'수강생별',exact:true}).click();await page.getByRole('button',{name:'가상 지민',exact:true}).click();await expect(page.getByRole('region',{name:'수강생 상세'})).toContainText('나의 첫 학습');
 await page.getByRole('dialog',{name:'수강생 상세',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('tab',{name:'일차별'}).click();
 await expect(page.getByRole('checkbox',{name:'가상 수빈 안내 선택'})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'가상 민준 안내 선택'})).toBeDisabled();await expect(page.getByRole('checkbox',{name:'가상 유나 안내 선택'})).toBeDisabled();
 await page.getByRole('checkbox',{name:'가상 지민 안내 선택'}).check();await page.getByRole('button',{name:'선택한 1명 안내 내용 작성'}).click();
 await expect(page.getByRole('region',{name:'학습 안내 확인'})).toContainText('가상 지민');expect(sent).toHaveLength(0);
 await expect(page.getByRole('tab',{name:'수강생별'})).toBeDisabled();
 await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();await expect(page.getByRole('status',{name:'안내 발송 결과'})).toContainText('1명에게 학습 안내를 보냈습니다');expect(sent).toHaveLength(1);expect(sent[0].recipients).toEqual([rows[0].memberId]);expect(sent[0].lessonId).toBe(lesson);
});
test('search and filters cover full cohort, share view and saved PNG omit private data',async({page})=>{
 await backend(page);await page.goto('/learning-care-test');await page.getByRole('tab',{name:'수강생별',exact:true}).click();await page.getByPlaceholder('이름 또는 이메일').fill('수빈');await expect(page.getByText('1개 수강 기록')).toBeVisible();
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
 await page.goto('/learning-care-test');await page.getByRole('tab',{name:'일차별'}).click();await page.getByRole('button',{name:'안내할 수강생 선택 · 최대 100명'}).click();await page.getByRole('button',{name:'선택한 1명 안내 내용 작성'}).click();await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();
 await expect(page.getByRole('alert')).toContainText('발송 결과를 확인하지 못했습니다');await expect(page.getByRole('textbox',{name:'안내 내용',exact:true})).toBeDisabled();await page.getByRole('button',{name:'발송 결과 다시 확인'}).click();await expect(page.getByRole('status',{name:'안내 발송 결과'})).toContainText('1명에게');expect(attempts).toHaveLength(2);expect(attempts[0]).toEqual(attempts[1]);
});
test('learning tiles distinguish completion from support needs and DAY cards open the exact filtered roster',async({page})=>{
 await backend(page);
 const cohortRows=[2,3,23,24,30].map((done,i)=>({...rows[0],enrollmentId:'enrollment-'+i,memberId:'member-'+i,name:'완주 테스트 '+i,lastContactAt:null,cells:Array.from({length:30},(_,n)=>({...cell(n<done?'completed':i===1&&n===3?'changes_requested':i===2&&n===23?'submitted':'not_submitted'),lessonId:'day-'+(n+1),day:n+1,title:'학습 '+(n+1)}))}));
 await page.route('**/api/admin/learning-care**',r=>r.fulfill({json:{...snapshot,rows:cohortRows}}));
 await page.goto('/learning-care-test');
 await expect(page.getByRole('tab',{name:'한눈에 보기'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('button',{name:'30일 미션 목표',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'완주 테스트 0 상세 · 공개 학습 7%'})).toHaveClass(/care-band-starting/);
 await expect(page.getByRole('button',{name:'완주 테스트 1 상세 · 공개 학습 10%'})).toHaveClass(/care-band-progressing/);
 await expect(page.getByRole('button',{name:'완주 테스트 2 상세 · 공개 학습 77%'})).toHaveClass(/care-band-progressing/);
 await expect(page.getByRole('button',{name:'완주 테스트 3 상세 · 공개 학습 80%'})).toHaveClass(/care-band-finishing/);
 await expect(page.getByRole('button',{name:'완주 테스트 4 상세 · 공개 학습 100%'})).toHaveClass(/care-band-finishing/);
 await page.getByRole('button',{name:/확인 필요만/}).click();await expect(page.locator('.care-student-tile')).toHaveCount(1);await expect(page.locator('.care-student-tile')).toContainText('보완 요청 1건');
 // Student filters must not alter the cohort-wide DAY denominator.
 await expect(page.getByRole('button',{name:'1주차 4일차 · 학습 4 명단 보기',exact:true})).toContainText('3/5명 완료');
 await page.getByRole('button',{name:'1주차 4일차 · 학습 4 보완 요청 1명',exact:true}).click();await expect(page.getByRole('tab',{name:'일차별',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByText('1개 수강 기록')).toBeVisible();await expect(page.getByRole('button',{name:'완주 테스트 1',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'한눈에 보기'}).click();await expect(page.getByRole('button',{name:'30일 미션 목표',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'완주 테스트 0 상세 · 공개 학습 7%'}).click();await expect(page.getByRole('region',{name:'수강생 상세'})).toContainText('완주 테스트 0님의 현재 위치');await page.getByRole('dialog',{name:'수강생 상세',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('learning completions remain visible before mission release; detail actions stay above its scroll and send only after confirmation',async({page})=>{
 const {sent}=await backend(page);
 const activeRow={...rows[0],cells:[cell('completed',1),cell('not_submitted',2),...Array.from({length:30},(_,i)=>({...cell('scheduled',i+3),track:'learning',title:'아주 긴 학습 제목 '.repeat(20)}))]};
 await page.route('**/api/admin/learning-care**',async route=>{
  if(route.request().method()==='POST'){await route.fallback();return;}
  await route.fulfill({json:{...snapshot,rows:[activeRow]}});
 });
 await page.goto('/learning-care-test');
 const tile=page.getByRole('button',{name:'가상 지민 상세 · 공개 학습 50%',exact:true});
 await expect(tile).toBeVisible();await expect(tile).not.toContainText('미션');
 await tile.click();const dialog=page.getByRole('dialog',{name:'수강생 상세',exact:true});
 await expect(dialog.getByRole('button',{name:'학습 독려하기',exact:true})).toBeEnabled();
 await expect(dialog.getByRole('link',{name:'회원 운영 정보'})).toHaveCount(0);
 await dialog.getByText('앞으로 공개할 학습 30개').click();
 await dialog.locator('.care-detail-body').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const layout=await dialog.evaluate(el=>{
  const d=el.getBoundingClientRect(),body=el.querySelector('.care-detail-body')!,action=el.querySelector('.care-detail-actions')!.getBoundingClientRect();
  return {fits:el.scrollWidth<=el.clientWidth+1&&body.scrollWidth<=body.clientWidth+1,actionVisible:action.top>=d.top&&action.bottom<=d.bottom,bodyScrolled:body.scrollTop>0};
 });
 expect(layout).toEqual({fits:true,actionVisible:true,bodyScrolled:true});
 await dialog.getByRole('button',{name:'학습 독려하기',exact:true}).click();
 const compose=page.getByRole('region',{name:'학습 안내 확인'});
 await expect(compose).toContainText('가상 지민');await expect(page.getByLabel('안내 내용',{exact:true})).toContainText('학습 2');expect(sent).toHaveLength(0);
 await page.getByRole('button',{name:'확인한 대상에게 보내기'}).click();
 await expect.poll(()=>sent.length).toBe(1);expect(sent[0].lessonId).toBe('learning-2');expect(sent[0].recipients).toEqual([activeRow.memberId]);
});
test('cohort switching distinguishes completed members and an empty new cohort without carrying filters across cohorts',async({page})=>{
 await backend(page);
 const options=[{id:cohort,name:'4기',courseTitle:'문샷',status:'in_progress',memberCount:4},{id:'old',name:'3기',courseTitle:'문샷',status:'completed',memberCount:1},{id:'next',name:'5기',courseTitle:'문샷',status:'upcoming',memberCount:0}];
 await page.route('**/api/admin/learning-care**',route=>{
  const selected=new URL(route.request().url()).searchParams.get('cohort')||cohort;
  return route.fulfill({json:{...snapshot,cohorts:options,cohortId:selected,rows:selected==='next'?[]:selected==='old'?[{...rows[3],name:'이전 기수 수강생'}]:rows}});
 });
 await page.goto('/learning-care-test');await page.getByRole('tab',{name:'수강생별',exact:true}).click();
 await page.getByPlaceholder('이름 또는 이메일').fill('없는 이름');
 await page.getByRole('combobox',{name:'기수',exact:true}).selectOption('old');
 await expect(page.getByRole('button',{name:'이전 기수 수강생',exact:true})).toBeVisible();
 await expect(page.getByText('기수가 종료되어도 수강생과 완료 기록을 계속 확인할 수 있습니다.')).toBeVisible();
 await page.getByRole('combobox',{name:'기수',exact:true}).selectOption('next');
 await expect(page.getByRole('status')).toContainText('이 기수에 등록된 수강생이 아직 없습니다');
 await expect(page.getByRole('button',{name:'이전 기수 수강생',exact:true})).toHaveCount(0);
});

test('mission data never enters admin progress, detail, DAY options or the share summary',async({page},testInfo)=>{
 await backend(page);await page.goto('/learning-care-test');
 await expect(page.getByRole('button',{name:'가상 지민 상세 · 공개 학습 50%',exact:true})).toBeVisible();
 await expect(page.locator('body')).not.toContainText('미션');
 await page.screenshot({path:testInfo.outputPath('learning-only-overview.png'),fullPage:true});
 await page.getByRole('button',{name:'가상 지민 상세 · 공개 학습 50%',exact:true}).click();
 await expect(page.getByRole('region',{name:'수강생 상세'})).not.toContainText('미션');
 await page.getByRole('dialog',{name:'수강생 상세',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();
 for(const tab of ['수강생별','일차별','공유용 요약']){await page.getByRole('tab',{name:tab,exact:true}).click();await expect(page.locator('body')).not.toContainText('미션');}
 await expect(page.getByRole('region',{name:'개인정보 없는 공유용 요약'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
