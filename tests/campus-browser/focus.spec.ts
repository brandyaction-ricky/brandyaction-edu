import {test,expect,type Page} from '@playwright/test';

const focus=(page:Page)=>page.getByRole('region',{name:'오늘은 15분만, 한 걸음.'});
const action='제안서 첫 문장을 고객이 얻는 변화 중심으로 고치기';
const nextStep='실제 고객 한 명에게 이 문장이 이해되는지 물어보기';
async function start(page:Page){
  await page.getByLabel('15분 안에 해볼 작은 일 하나').fill(action);
  await page.getByRole('button',{name:'15분 실행 시작',exact:true}).click();
  await expect(focus(page).getByRole('heading',{name:action,exact:true})).toBeVisible();
}
async function noOverflow(page:Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
}

test('focus pauses, survives reload, finishes with a note and resumes the next action',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install({time:new Date('2026-11-02T12:00:00Z')});
  await page.goto('/journal');
  // Assertions measure intentional clock advances, not CI/trace wall-clock delays.
  await page.clock.pauseAt(new Date('2026-11-02T12:10:00Z'));
  await expect(focus(page).getByText(/체험 기록은 이 브라우저에만/)).toBeVisible();
  await start(page);
  await page.clock.runFor(60_000);
  await expect(page.getByLabel('남은 실행 시간')).toHaveText('14:00');
  await page.getByRole('button',{name:'잠깐 멈추기',exact:true}).click();
  await page.clock.runFor(120_000);
  await expect(page.getByLabel('남은 실행 시간')).toHaveText('14:00');
  await page.reload();
  await expect(page.getByRole('button',{name:'실행 다시 이어가기',exact:true})).toBeVisible();
  await expect(page.getByLabel('남은 실행 시간')).toHaveText('14:00');
  await page.getByRole('button',{name:'실행 다시 이어가기',exact:true}).click();
  await page.clock.runFor(30_000);
  await expect(page.getByLabel('남은 실행 시간')).toHaveText('13:30');
  await noOverflow(page);
  await page.getByRole('button',{name:'오늘 한 일 남기기',exact:true}).click();
  const save=page.getByRole('button',{name:'기록 저장하고 마무리',exact:true});
  await expect(save).toBeDisabled();
  await page.getByLabel('오늘 어디까지 했나요?').fill('제안서의 첫 문장을 구체적인 고객 변화로 수정했어요.');
  await expect(save).toBeDisabled();
  await page.getByLabel('다음에 시작할 일은?').fill(nextStep);
  await save.click();
  await expect(focus(page).getByRole('status')).toContainText('오늘의 실행과 다음 할 일을 저장했어요.');
  await expect(page.getByRole('button',{name:'잠깐 멈추기',exact:true})).toHaveCount(0);
  await page.reload();
  await expect(focus(page).getByText(nextStep,{exact:true})).toBeVisible();
  await focus(page).getByText('지난 실행 기록 보기',{exact:true}).click();
  await expect(focus(page)).toContainText('제안서의 첫 문장을 구체적인 고객 변화로 수정했어요.');
  await page.getByRole('button',{name:'이 할 일로 다시 시작',exact:true}).click();
  await expect(page.getByLabel('15분 안에 해볼 작은 일 하나')).toHaveValue(nextStep);
  await page.getByRole('button',{name:'15분 실행 시작',exact:true}).click();
  await expect(focus(page).getByRole('heading',{name:nextStep,exact:true})).toBeVisible();
  await expect(page.getByLabel('남은 실행 시간')).toHaveText('15:00');
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('timer expiry asks for an explicit finish without changing lesson or mission progress',async({page})=>{
  const focusRequests:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/campus/focus'))focusRequests.push(request.url());});
  await page.clock.install({time:new Date('2026-11-02T13:00:00Z')});
  await page.goto('/journal');
  await page.clock.pauseAt(new Date('2026-11-02T13:10:00Z'));
  await start(page);
  await page.clock.fastForward(900_000);
  await expect(page.getByLabel('남은 실행 시간')).toHaveText('00:00');
  await expect(focus(page).getByText('목표 시간이 지났어요. 결과를 남겨볼까요?',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'오늘 한 일 남기기',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'지난번에 남겨둔 다음 한 걸음',exact:true})).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('남은 실행 시간')).toHaveText('00:00');
  await expect(page.getByRole('button',{name:'오늘 한 일 남기기',exact:true})).toBeVisible();
  expect(focusRequests).toEqual([]); // This synthetic preview must never write member records or poll the server.
});

test('a stale second tab cannot overwrite a newer focus state and can reload to continue',async({page,context})=>{
  await page.goto('/journal');await start(page);
  const second=await context.newPage();await second.goto('/journal');
  await expect(second.getByRole('button',{name:'잠깐 멈추기',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'잠깐 멈추기',exact:true}).click();
  await expect(page.getByRole('button',{name:'실행 다시 이어가기',exact:true})).toBeVisible();
  await second.getByRole('button',{name:'잠깐 멈추기',exact:true}).click();
  await expect(focus(second).getByRole('alert')).toContainText(/다른.*기록|다른.*변경/);
  await expect(second.getByRole('button',{name:'오늘 한 일 남기기',exact:true})).toBeDisabled();
  await second.getByRole('button',{name:'기록 다시 확인',exact:true}).click();
  await expect(focus(second).getByRole('alert')).toHaveCount(0);
  await expect(second.getByRole('button',{name:'실행 다시 이어가기',exact:true})).toBeVisible();
  await second.getByRole('button',{name:'실행 다시 이어가기',exact:true}).click();
  await expect(second.getByRole('button',{name:'잠깐 멈추기',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'잠깐 멈추기',exact:true})).toBeVisible();
});

test('long notes wrap without covering controls on the focus screen',async({page})=>{
  const longAction='고객의변화가명확한제안문장'.repeat(20);
  const longNote='학습내용을바탕으로직접실행한결과를기록합니다'.repeat(20);
  await page.goto('/journal');
  await page.getByLabel('15분 안에 해볼 작은 일 하나').fill(longAction);
  await page.getByRole('button',{name:'15분 실행 시작',exact:true}).click();
  await expect(focus(page).getByRole('heading',{name:longAction,exact:true})).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button',{name:'오늘 한 일 남기기',exact:true}).click();
  await page.getByLabel('오늘 어디까지 했나요?').fill(longNote);
  await page.getByLabel('다음에 시작할 일은?').fill(longAction);
  await page.getByRole('button',{name:'기록 저장하고 마무리',exact:true}).click();
  await expect(page.getByRole('heading',{name:'지난번에 남겨둔 다음 한 걸음',exact:true})).toBeVisible();
  await focus(page).getByText('지난 실행 기록 보기',{exact:true}).click();
  await noOverflow(page);
  await expect(page.getByRole('button',{name:'이 할 일로 다시 시작',exact:true})).toBeVisible();
});
