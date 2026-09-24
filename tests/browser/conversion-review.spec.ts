Warning: truncated output (original token count: 7977)
Total output lines: 413

import { expect, test, type Page } from '@playwright/test';
import { createMockJudgment, evidenceVersions, type ConversionCase, type ConversionRun, type ConversionSnapshot } from '../../lib/conversion-review';

// Synthetic inquiry and product data only. Route interception cannot reach DB,
// auth, model or message providers, and the fixture server rejects other writes.
const timestamp = '2026-09-20T01:00:00.000Z';
const courseId = '11111111-1111-4111-8111-111111111111';
const initialCase: ConversionCase = {
  id: '22222222-2222-4222-8222-222222222222', source_type: 'manual', sample_origin: 'current', legacy_course_label: null, question_id: null,
  course_id: courseId, cohort_id: null, subject: '초보 수강과 녹화 문의',
  content: '초보자도 따라갈 수 있나요? 실시간 참석이 어려운데 녹화가 있나요?',
  source_label: '합성 상담 예시', received_at: timestamp, customer_id: null, input_version: 1, created_at: timestamp,
};
function initialSnapshot(): ConversionSnapshot {
  return {
    cases: [{ ...initialCase }],
    evidence: [{ id: '33333333-3333-4333-8333-333333333333', course_id: courseId, cohort_id: null,
      title: '수강 수준 안내', body: '초보자를 대상으로 기초 개념부터 설명합니다.',
      source_url: 'https://example.test/course-guide', version: 1, status: 'approved' }],
    courses: [{ id: courseId, title: '합성 교육 상품' }],
    cohorts: [{ id: '44444444-4444-4444-8444-444444444444', course_id: courseId, name: '합성 1기' }],
    questions: [], runs: [], reviews: [], adjudications: [], capabilities: { can_manage_evidence: true, can_mock: true },
  };
}

async function fixture(page: Page, provider: 'mock' | 'jev' = 'mock') {
  const snapshot = initialSnapshot();
  if (provider === 'jev') snapshot.capabilities = { ...snapshot.capabilities, can_jev: true, can_adjudicate: true, can_jev_v4: true, can_analyze: true, analyze_provider: 'jev' };
  const mutations: Record<string, unknown>[] = [];
  const unexpectedApi: string[] = [];
  let forbidden = false;
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (!['/api/conversion', '/api/conversion/adjudication', '/api/conversion/jev-v2', '/api/conversion/jev-v3', '/api/conversion/jev-v4'].includes(pathname)) {
      unexpectedApi.push(route.request().url());
      await route.fulfill({ status: 405, json: { error: '검증에 허용되지 않은 API입니다.' } }); return;
    }
    if (forbidden) { await route.fulfill({ status: 403, json: { error: '전환 관리 접근 권한이 없습니다.' } }); return; }
    if (pathname === '/api/conversion/jev-v2') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const choice = (value: string) => ({ type: 'choice' as const, choice: value, confidence: .75, probabilities: { [value]: .75 } });
      const result = { contract_version: 2 as const, model: 'jev-test', decisions: {
        information_need: choice('skill_requirement'), confirmed_barrier: choice('none_stated'),
        operational_issue: choice('none_stated'), observable_stage: choice('information_seeking'),
      } };
      snapshot.jev_v2_runs ||= [];
      snapshot.jev_v2_runs.push({ id: `v2-${snapshot.jev_v2_runs.length + 1}`, v1_run_id: body.v1_run_id,
        case_id: initialCase.id, calibration_review_id: snapshot.reviews[0].id, input_version: 1,
        status: 'completed', result, created_at: timestamp, updated_at: timestamp });
      await route.fulfill({ json: { ok: true, result } }); return;
    }
    if (pathname === '/api/conversion/jev-v3') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const choice = (value: string) => ({ type: 'choice' as const, choice: value, confidence: .75, probabilities: { [value]: .75 } });
      const result = { contract_version: 3 as const, model: 'jev-test', decisions: {
        information_need: choice('registration_or_access'), confirmed_barrier: choice('none_stated'),
        attempted_action_target: choice('free_live_or_replay'), operational_issue: choice('paid_application_failure'),
        observable_stage: choice('paid_application_or_payment_attempt'),
      }, consistency_flags: ['paid_attempt_without_paid_target', 'paid_failure_without_paid_target'] as const };
      snapshot.jev_v3_runs ||= [];
      snapshot.jev_v3_runs.push({ id: `v3-${snapshot.jev_v3_runs.length + 1}`, v1_run_id: body.v1_run_id,
        case_id: initialCase.id, calibration_review_id: snapshot.reviews[0].id, input_version: 1,
        status: 'completed', result: { ...result, consistency_flags: [...result.consistency_flags] }, created_at: timestamp, updated_at: timestamp });
      await route.fulfill({ json: { ok: true, result } }); return;
    }
    if (pathname === '/api/conversion/jev-v4') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const choice = (value: string) => ({ type: 'choice' as const, choice: value, confidence: .75, probabilities: { [value]: .75 } });
      const result = { contract_version: 4 as const, model: 'jev-test', decisions: {
        information_need: choice('registration_or_access'), confirmed_barrier: choice('none_stated'),
        attempted_action_target: choice('free_live_or_replay'), operational_issue: choice('free_content_access_failure'),
        paid_program_reference: choice('future_consideration_after_free_content'), observable_stage: choice('no_purchase_signal'),
      }, consistency_flags: ['paid_reference_without_stage'] as const, uncertainty_flags: [] };
      snapshot.jev_v4_runs ||= [];
      snapshot.jev_v4_runs.push({ id: `v4-${snapshot.jev_v4_runs.length + 1}`, v1_run_id: body.v1_run_id,
        case_id: initialCase.id, calibration_review_id: null, input_version: 1,
        status: 'completed', result: { ...result, consistency_flags: [...result.consistency_flags] }, created_at: timestamp, updated_at: timestamp });
      await route.fulfill({ json: { ok: true, result } }); return;
    }
    if (pathname === '/api/conversion/adjudication') {
      const body = route.request().postDataJSON();
      mutations.push(body);
      const note = { id: `adjudication-${snapshot.adjudications!.length + 1}`, ...body, actor_id: 'synthetic-operator', created_at: timestamp };
      snapshot.adjudications!.push(note);
      await route.fulfill({ json: { ok: true, note } }); return;
    }
    if (route.request().method() === 'GET') { await route.fulfill({ json: snapshot }); return; }
    const body = route.request().postDataJSON();
    mutations.push(body);
    if (body.action === 'save_case') {
      const item: ConversionCase = { ...initialCase, id: '55555555-5555-4555-8555-555555555555',
        subject: body.subject, content: body.content, source_label: body.source_label,
        received_at: body.received_at, course_id: body.course_id, cohort_id: body.cohort_id,
        sample_origin: body.sample_origin, legacy_course_labe…4477 tokens truncated…', exact: true }).click();
  await page.getByLabel(/^문의 출처/).selectOption('manual');
  await expect(page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '문의 연결', exact: true }) })).toBeVisible();
  await noOverflow();
});

test('room settings save separately from product mapping and changing recruitment cannot overwrite prior rooms', async ({page}) => {
  const state=await fixture(page); state.snapshot.capabilities.can_manage_funnel=true;
  await page.route('**/api/conversion/funnel', route=>route.fulfill({json:{draft:null,measurement:'unverified'}}));
  await page.route('**/api/conversion/links**',route=>route.fulfill({json:{link:null,counts:{paid:0,organic:0}}}));
  const records: Record<string, Record<string, unknown>>={};
  let writes=0;
  await page.route('**/api/conversion/rooms**', async route=>{
    if(route.request().method()==='GET') return route.fulfill({json:{draft:records[new URL(route.request().url()).searchParams.get('period')!]??null}});
    const body=route.request().postDataJSON(); expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/); expect(body.expected_version).toBe(0);
    records[body.period]={period_id:body.period,version:1,settings:body.settings};writes++;
    return route.fulfill({json:{draft:records[body.period]}});
  });
  await page.getByRole('button',{name:'새로고침',exact:true}).click();
  await page.getByRole('button',{name:'모집 경로 준비',exact:true}).click();
  await page.getByRole('button',{name:'모집별 카톡방 관리',exact:true}).click();
  await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
  await page.getByLabel('모집 이름',{exact:true}).fill('Synthetic recruitment');
  await page.getByLabel('오가닉 오픈채팅방 주소',{exact:true}).fill('https://open.kakao.com/o/organicTest');
  await page.getByLabel('광고 오픈채팅방 주소',{exact:true}).fill('https://open.kakao.com.evil.test/o/paidTest');
  await page.getByRole('button',{name:'모집 방 설정 저장',exact:true}).click();
  await expect(page.getByText('https://open.kakao.com/o/... 형식의 방 주소를 입력해 주세요.',{exact:true})).toBeVisible();
  expect(writes).toBe(0);
  await page.getByLabel('광고 오픈채팅방 주소',{exact:true}).fill('https://open.kakao.com/o/paidTest');
  await page.getByRole('button',{name:'모집 방 설정 저장',exact:true}).click();
  await expect(page.getByText('방 설정 버전 1 · moonshot-4',{exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:/^모집 구분 코드/}).fill('next-month');
  await expect(page.getByRole('button',{name:'모집 방 설정 저장',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
  await expect(page.getByLabel('오가닉 오픈채팅방 주소',{exact:true})).toHaveValue('');
  await page.getByRole('textbox',{name:/^모집 구분 코드/}).fill('moonshot-4');
  await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
  await expect(page.getByLabel('광고 오픈채팅방 주소',{exact:true})).toHaveValue('https://open.kakao.com/o/paidTest');
  expect(writes).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});


test('recruitment links activate explicitly, show distinct channel URLs and stop without losing counts',async({page})=>{
 const state=await fixture(page);state.snapshot.capabilities.can_manage_funnel=true;
 await page.route('**/api/conversion/funnel',route=>route.fulfill({json:{draft:null}}));
 await page.route('**/api/conversion/rooms**',route=>route.fulfill({json:{draft:{version:1,settings:{label:'Synthetic',organicUrl:'https://open.kakao.com/o/organicTest',paidUrl:'https://open.kakao.com/o/paidTest',paidMode:'undecided'}}}}));
 const mutations: Record<string,unknown>[]=[];
 let link:{id:string;room_version:number;revision:number;enabled:boolean}|null=null;
 await page.route('**/api/conversion/links**',async route=>{
  if(route.request().method()==='POST') {const body=route.request().postDataJSON();mutations.push(body);expect(body.period).toBe('moonshot-4');expect(body.version).toBe(1);expect(body.expected).toBe(link?.revision??0);link={id:courseId,room_version:1,revision:(link?.revision??0)+1,enabled:body.enabled};}
  return route.fulfill({json:{link,counts:{paid:2,organic:1}}});
 });
 await page.getByRole('button',{name:'새로고침',exact:true}).click();
 await page.getByRole('button',{name:'모집 경로 준비',exact:true}).click();
 await page.getByRole('button',{name:'모집별 카톡방 관리',exact:true}).click();
 await page.getByRole('button',{name:'모집 방 설정 불러오기',exact:true}).click();
 await expect(page.getByRole('button',{name:'저장된 방으로 링크 활성화',exact:true})).toBeEnabled();
 expect(mutations).toHaveLength(0);
 await page.getByRole('button',{name:'저장된 방으로 링크 활성화',exact:true}).click();
 await expect(page.getByLabel('광고용 모집 링크',{exact:true})).toHaveValue(new RegExp('/join/'+courseId+'/paid$'));
 await expect(page.getByLabel('오가닉용 모집 링크',{exact:true})).toHaveValue(new RegExp('/join/'+courseId+'/organic$'));
 await page.getByRole('button',{name:'모집 링크 중지',exact:true}).click();
 await expect(page.getByText('링크 상태: 중지 · 연결된 방 버전 1',{exact:true})).toBeVisible();
 await expect(page.getByText('전체 방 버전의 이동 버튼 클릭 기록 — 광고용 링크 2회 · 오가닉용 링크 1회',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'링크·클릭 기록 새로고침',exact:true}).click();
 await expect(page.getByRole('button',{name:'모집 링크 중지',exact:true})).toBeDisabled();
 expect(mutations.map(m=>m.enabled)).toEqual([true,false]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

test('integrated workspace separates inquiry review from recruitment and removes duplicate mapping draft', async ({ page }) => {
  await fixture(page);
  await page.goto('/admin/conversion?workspace=1');
  await expect(page.getByRole('heading', { name: '모집 운영', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '모집 경로 초안 저장', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '문의 연결', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '구매 전 문의 검토', exact: true }).click();
  await expect(page.getByRole('button', { name: '문의 연결', exact: true })).toBeVisible();
  await expect(page.getByText('초보 수강과 녹화 문의', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '모집 설정·구매·후속 안내', exact: true }).click();
  await expect(page.getByRole('button', { name: '문의 연결', exact: true })).not.toBeVisible();
});
