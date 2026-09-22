import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {await page.goto('/mission-demo');});

test('mission discussion saves once, shows operator answer, retains failed input and clears rows after access loss', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let rows: Record<string, unknown>[] = [], writes = 0, denied = false, fail = false;
  await page.route('**/api/mission/questions**', async route => {
    if (denied) return route.fulfill({status:403,json:{error:'수강 권한이 필요합니다.'}});
    if (route.request().method() === 'POST') {
      writes++;
      if (fail) return route.fulfill({status:503,json:{error:'일시적 저장 실패'}});
      const body = route.request().postDataJSON();
      expect(body.missionId).toBe('44444444-4444-4444-8444-444444444444');
      expect(body.enrollmentId).toBe('55555555-5555-4555-8555-555555555555');
      expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
      rows = [{id:'question',title:body.title,content:body.content,status:'open'}];
      return route.fulfill({json:{ok:true,id:'question'}});
    }
    return route.fulfill({json:{rows,page:1,pageSize:20,total:rows.length}});
  });
  await member(page);
  const discussion = page.getByRole('region',{name:'이 미션 질문·답변'});
  await discussion.getByRole('textbox',{name:'미션 질문 제목'}).fill('실행 순서 질문');
  await discussion.getByRole('textbox',{name:'미션 질문 내용'}).fill('첫 단계를 알려주세요');
  await discussion.getByRole('button',{name:'미션 질문 등록',exact:true}).click();
  await expect(discussion.getByRole('heading',{name:'실행 순서 질문'})).toBeVisible();
  expect(writes).toBe(1);
  rows[0] = {...rows[0],status:'answered',answer:'먼저 실행 목표를 정하세요'};
  await discussion.getByRole('button',{name:'답변 새로고침'}).click();
  await expect(discussion.getByText('먼저 실행 목표를 정하세요')).toBeVisible();
  fail = true;
  await discussion.getByRole('textbox',{name:'미션 질문 제목'}).fill('남겨둘 질문');
  await discussion.getByRole('textbox',{name:'미션 질문 내용'}).fill('저장 실패 시 보존');
  await discussion.getByRole('button',{name:'미션 질문 등록',exact:true}).click();
  await expect(discussion.getByRole('alert')).toContainText('일시적 저장 실패');
  await expect(discussion.getByRole('textbox',{name:'미션 질문 내용'})).toHaveValue('저장 실패 시 보존');
  denied = true;
  await discussion.getByRole('button',{name:'답변 새로고침'}).click();
  await expect(discussion.getByText('먼저 실행 목표를 정하세요')).toHaveCount(0);
  await expect(discussion.getByRole('textbox',{name:'미션 질문 제목'})).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
async function member(page: import('@playwright/test').Page) {
  await page.getByRole('button',{name:'회원 · 내 미션',exact:true}).click();
  await page.getByRole('link',{name:/미션 시작|이어서 작성|보완하기/}).first().click();
  await expect(page.getByRole('button',{name:/^미션 제출$|보완 후 다시 제출/})).toBeEnabled();
}
test('register, preview, reorder and edit a mission; unsaved edits need confirmation',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'새 미션 만들기',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox',{name:'클래스',exact:true}).selectOption({label:'일을 바꾸는 AI 실전 클래스'});
  await dialog.getByRole('combobox',{name:'주차',exact:true}).selectOption({index:1});
  await dialog.getByRole('combobox',{name:/연결 학습/}).selectOption({label:'DAY 2 · 첫 결과물 만들기'});
  await dialog.getByRole('textbox',{name:'미션 제목',exact:true}).fill('내 첫 결과물');
  await dialog.getByRole('button',{name:'질문 추가',exact:true}).click();
  await dialog.getByRole('textbox',{name:'질문 1 내용',exact:true}).fill('어떤 결과를 만들었나요?');
  await dialog.getByRole('button',{name:'질문 추가',exact:true}).click();
  await dialog.getByRole('textbox',{name:'질문 2 내용',exact:true}).fill('무엇을 배웠나요?');
  await dialog.getByRole('button',{name:'질문 2 위로',exact:true}).click();
  await expect(dialog.getByRole('textbox',{name:'질문 1 내용',exact:true})).toHaveValue('무엇을 배웠나요?');
  await dialog.getByRole('button',{name:'체크 항목 추가',exact:true}).click();
  await dialog.getByRole('textbox',{name:'체크 항목 1',exact:true}).fill('공유 권한을 확인했습니다');
  await dialog.getByRole('button',{name:'회원 화면 미리보기',exact:true}).click();
  await expect(dialog.getByRole('textbox',{name:/Q01 무엇을 배웠나요/})).toBeDisabled();
  await page.screenshot({path:info.outputPath('mission-preview.png'),fullPage:true});
  await dialog.getByRole('button',{name:'편집으로 돌아가기',exact:true}).first().click();
  await dialog.getByRole('button',{name:'비공개로 저장',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'내 첫 결과물',exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'목록 검색'}).fill('내 첫 결과물');
  await expect(page.getByRole('button',{name:'나의 첫 AI 업무 개선 실험',exact:true})).not.toBeVisible();
  await page.getByRole('button',{name:'내 첫 결과물',exact:true}).click();
  await page.getByRole('textbox',{name:'미션 제목',exact:true}).fill('저장하지 않은 제목');
  await page.getByRole('button',{name:'취소',exact:true}).click();
  await expect(page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'편집을 종료할까요?'})})).toBeVisible();
  await page.getByRole('button',{name:'계속 편집',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'미션 제목',exact:true})).toHaveValue('저장하지 않은 제목');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'편집 종료',exact:true}).click();
  await expect(page.getByRole('button',{name:'내 첫 결과물',exact:true})).toBeFocused();
  expect(errors).toEqual([]);
});

test('draft survives reload, required answers gate submission, review returns feedback and resubmission retains history',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await member(page);
  await page.getByRole('button',{name:'미션 제출',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('필수 질문');
  await page.getByRole('textbox',{name:/Q01/}).fill('회의록 요약 업무를 줄여 보았습니다.');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'임시저장했습니다'})).toBeVisible();
  await page.reload();
  await member(page);
  await expect(page.getByRole('textbox',{name:/Q01/})).toHaveValue('회의록 요약 업무를 줄여 보았습니다.');
  await page.getByRole('textbox',{name:/Q02/}).fill('20분 걸리던 정리를 5분 만에 마쳤습니다.');
  await page.getByRole('button',{name:'미션 제출',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('필수 체크');
  await page.getByRole('checkbox',{name:/실제로 실행한/}).check();
  await page.screenshot({path:info.outputPath('member-mission.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'미션 제출',exact:true}).click();
  await expect(page.getByText('제출을 마쳤어요.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'운영자 · 제출물 검토',exact:true}).click();
  await expect(page.getByText('회의록 요약 업무를 줄여 보았습니다.',{exact:true})).toBeVisible();
  await page.getByLabel('멘토 피드백',{exact:true}).fill('실행 예시를 한 가지 더 추가해 주세요.');
  await page.getByRole('button',{name:'보완 요청',exact:true}).last().click();
  await member(page);
  await expect(page.getByText('실행 예시를 한 가지 더 추가해 주세요.',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:/Q02/}).fill('두 번째 회의에서도 15분을 절약했습니다.');
  await page.getByRole('button',{name:'보완 후 다시 제출',exact:true}).click();
  await expect(page.getByText('제출을 마쳤어요.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'운영자 · 제출물 검토',exact:true}).click();
  await expect(page.getByText('두 번째 회의에서도 15분을 절약했습니다.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'승인 후 다음',exact:true}).click();
  await page.getByRole('button',{name:'회원 · 내 미션',exact:true}).click();
  await expect(page.getByRole('link',{name:'완료한 미션 보기'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('save failure preserves answers and loading failure supports safe draft and retry',async({page})=>{
  await page.route('**/api/platform/workflows?*',route=>route.fulfill({status:503,json:{error:'일시적 조회 오류'}}));
  await page.getByRole('button',{name:'회원 · 내 미션',exact:true}).click();
  await page.getByRole('link',{name:'미션 시작'}).first().click();
  await expect(page.getByRole('alert')).toContainText('일시적 조회 오류');
  await page.getByRole('textbox',{name:/Q01/}).fill('저장 실패에도 지켜야 하는 내용');
  await page.getByText('테스트 도구',{exact:true}).click();
  await page.getByRole('button',{name:'다음 저장 실패시키기'}).click();
  await page.getByRole('button',{name:'임시저장',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'테스트 저장 실패'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:/Q01/})).toHaveValue('저장 실패에도 지켜야 하는 내용');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'임시저장했습니다'})).toBeVisible();
  await page.unroute('**/api/platform/workflows?*');
  await page.getByRole('button',{name:'다시 불러오기'}).click();
  await expect(page.getByRole('button',{name:'미션 제출',exact:true})).toBeEnabled();
});

test('server review pages keep old submissions reachable and clear private data after permission loss',async({page},info)=>{
  const seen:string[]=[];
  let denied=false;
  await page.route('**/api/mission/reviews?*',async route=>{
    const params=new URL(route.request().url()).searchParams;seen.push(params.toString());
    if(denied){await route.fulfill({status:403,json:{error:'제출물을 조회할 운영 권한이 필요합니다.'}});return;}
    const number=Number(params.get('page')||1);
    const search=params.get('query')||'';
    await route.fulfill({json:{rows:[{id:'synthetic-'+number,enrollment_id:'enrollment',mission_id:'mission',status:'submitted',attempt_number:number,submitted_at:'2026-09-01T00:00:00Z',response:{text:'검토할 답변 '+number},member:{id:'member',full_name:search||'오래 기다린 회원 '+number},mission:{id:'mission',title:'실행 미션'},course:{id:'course',title:'실전 과정'}}],pagination:{page:number,pageSize:50,total:1051},counts:{all:1051,submitted:1051,approved:0,rejected:0,changes_requested:0}}});
  });
  await page.goto('/mission-demo?remote=1');
  await page.getByRole('button',{name:'운영자 · 제출물 검토',exact:true}).click();
  await expect(page.getByLabel('제출물 페이지')).toContainText('전체 1051건 · 1페이지');
  await expect(page.getByText('검토할 답변 1',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'다음 페이지',exact:true}).click();
  await expect(page.getByLabel('제출물 페이지')).toContainText('2페이지');
  await expect(page.getByText('검토할 답변 2',{exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'제출물 검색'}).fill('찾을 회원');
  await expect(page.getByLabel('제출물 페이지')).toContainText('1페이지');
  expect(seen.some(query=>new URLSearchParams(query).get('query')==='찾을 회원')).toBe(true);
  await page.screenshot({path:info.outputPath('server-review-page.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  denied=true;
  await page.getByRole('combobox',{name:'제출물 정렬'}).selectOption('new');
  await expect(page.getByRole('alert')).toContainText('운영 권한');
  await expect(page.getByText('검토할 답변 1',{exact:true})).not.toBeVisible();
  await expect(page.getByRole('button',{name:'승인 후 다음',exact:true})).not.toBeVisible();
  denied=false;
  await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();
  await expect(page.getByText('검토할 답변 1',{exact:true})).toBeVisible();
});

test('draft revisions advance across repeated saves without losing current answers',async({page})=>{
  await member(page);
  await page.getByRole('textbox',{name:/Q01/}).fill('첫 초안');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'임시저장했습니다'})).toBeVisible();
  await page.getByRole('textbox',{name:/Q01/}).fill('두 번째 초안');
  await page.getByRole('button',{name:'임시저장',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'임시저장했습니다'})).toBeVisible();
  await page.reload();await member(page);
  await expect(page.getByRole('textbox',{name:/Q01/})).toHaveValue('두 번째 초안');
});
