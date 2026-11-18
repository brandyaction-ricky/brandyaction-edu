import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, mode: 'ready' | 'failure' | 'empty' | 'ranges' | 'ad-error' | 'ad-missing' | 'ad-legacy' | 'ad-zero' = 'ready') {
  const campaign = { id:'bbbbbbbb-bbbb-4000-8000-000000000002',landing_id:'aaaaaaaa-aaaa-4000-8000-000000000001',name:'광고 분석 검수',utm_campaign:'qa',start_day:'2026-09-01',end_day:'2026-09-30',new_customer_price:1650000,existing_customer_price:1100000,live_peak:null,uses_ads:true,meta_ad_account_id:'act_123456',meta_campaign_ids:['123456789'],meta_sync_status:'success',meta_last_synced_at:'2026-10-15T00:00:00Z',meta_sync_error:null };
  const version=(v:number,n=20,cta=4)=>({layout_ver:v,created_at:`2026-09-${v===1?'01':'15'}T00:00:00Z`,note:v===1?'기존 페이지':'가격 설명 보완',sessions:n,cta_sessions:cta,first_seen:'2026-09-15T00:00:00Z',last_seen:'2026-09-15T03:00:00Z',sections:[{section:'hero',reached:n,not_continued:2,avg_dwell_ms:100},{section:'detail',reached:n-2,not_continued:null,avg_dwell_ms:100}]});
  const revenue={state:mode==='empty'?'unmapped':'ready',cohort_id:'cccccccc-cccc-4000-8000-000000000003',cohort_label:'시험 강의 · 4기',orders:2,new_orders:1,existing_orders:1,gross:1300000,refunds:200000,net:1100000,spend:100000,roas:1100,needs_review:0};
  const behavior={sessions:40,measured_sessions:mode==='empty'?0:30,scroll:[{depth:0,reached:30,not_continued:10},{depth:50,reached:20,not_continued:5},{depth:100,reached:15,not_continued:null}],versions:mode==='empty'?[]:[version(1),version(2,20,8)]};
  let failed=false;
  await page.route('**/api/landing/performance**', async route=>{
    const url=new URL(route.request().url());
    if(!url.searchParams.has('start'))return route.fulfill({json:{can_manage_campaign:true,courses:[{id:campaign.landing_id,title:'시험 무료클래스',status:'published',tracking:'active',campaigns:[campaign,{...campaign,id:'dddddddd-dddd-4000-8000-000000000004',name:'추가 페이지'}]}]}});
    const fail=mode==='failure'&&!failed;failed=true;
    const filtered=url.searchParams.has('layout');
    const report={financial_mode:'orders',campaign,source_title:'시험 무료클래스',summary_b:{has_data:true,sessions:40,visitors:30,cta_click_sessions:12,cta_clicks:20,converted_visitors:10,spend:100000,meta_impressions:1000,meta_link_clicks:100,meta_registrations:300},summary_a:null,actuals:[],daily:[],performance:[],options:{campaigns:[],adsets:[],creatives:[],devices:[],layouts:[1,2],ad_types:[]},data_state:{sessions_exist:true,filtered_sessions_exist:true,meta_exists:!filtered},campaign_summary:{kakao_members:100,kakao_delta:20,new_payments:99,existing_payments:99,revenue:999999999,spend:100,roas:99999999,live_peak:null},ui:{insights:fail?null:{revenue,behavior},errors:fail?{insights:'자동 매출·행동 분석을 불러오지 못했습니다. 다시 조회해 주세요.'}:{},daily_a:null,last_collected_at:null,actual_presence:{new_payments:true,existing_payments:true},previous_day_members:{},period_actuals:{payments:198,kakao_delta:20}},range:{startDay:url.searchParams.get('start'),endDay:url.searchParams.get('end'),compareStartDay:null,compareEndDay:null}};
    if (mode==='ranges') Object.assign(report.ui,{current_kakao:{members:7505,day:'2026-09-29'},collection_ranges:{edu:{start:'2026-09-10',end:'2026-09-30'},meta:{start:'2026-09-01',end:'2026-09-30'}}});
    const day=(day:string,spend:number,registrations:number|null,state='ready')=>({day,spend,impressions:1000,link_clicks:20,registrations,registration_state:state});
    const legacy=mode==='ad-missing'||mode==='ad-legacy';
    const days=[
      day('2026-09-01',10000,mode==='ad-zero'?0:10),
      day('2026-09-02',20000,mode==='ad-missing'?null:0,mode==='ad-missing'?'missing':'ready'),
      day('2026-09-04',30000,legacy?null:mode==='ad-zero'?0:20,legacy?'unknown':'ready'),
    ];
    Object.assign(report.ui,{ad_trend:{state:mode==='ad-error'?'error':filtered?'filtered':'ready',current:mode==='empty'||mode==='ad-error'||filtered?[]:days,previous:[]}});
    return route.fulfill({json:url.searchParams.getAll('campaign').length>1?{multi:true,reports:[report,{...report,campaign:{...campaign,id:'dddddddd-dddd-4000-8000-000000000004'},source_title:'추가 페이지'}]}:report});
  });
  await page.goto('/admin/landing?preset=custom&start=2026-09-01&end=2026-09-30');
  await expect(page.getByRole('heading',{name:/전환 퍼널|한눈에 보는 모집 성과/})).toBeVisible();
}

const recruitment = (page: Page) => page.getByRole('region',{name:'선택 기간 전환 퍼널'}).getByRole('group',{name:'Meta 모집 지표'});

test('daily advertising metrics expose exact costs, zero denominators and missing-day gaps on every viewport', async({page})=>{
 await fixture(page);
 const summary=recruitment(page);
 const section=page.locator('section.admin-section').filter({has:page.getByRole('heading',{name:'일별 광고 성과',exact:true})});
 await expect(summary.getByText('60,000원',{exact:true})).toBeVisible();
 await expect(summary.getByText('30건',{exact:true})).toBeVisible();
 await expect(summary.getByText('2,000원',{exact:true})).toBeVisible();
 await expect(summary.getByText('등록 표본 30건 이상',{exact:true})).toBeVisible();
 if (page.viewportSize()?.width === 390) {
   expect(await summary.evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
 }
 await summary.evaluate(element=>element.scrollIntoView({block:'end'}));
 await summary.screenshot({path:test.info().outputPath('ad-recruitment-summary.png')});
 await expect(section.getByRole('article')).toHaveCount(0);
 const chart=section.getByRole('img',{name:'일별 광고비 추이'});
 await expect(chart).toBeVisible();
 expect(await chart.locator('path').getAttribute('d')).toMatch(/^M[^M]+M/);
 await section.getByRole('button',{name:'등록당 비용',exact:true}).click();
 await expect(section.getByRole('img',{name:'일별 등록당 비용 추이'})).toBeVisible();
 await section.getByText('광고 일별 수치 보기',{exact:true}).click();
 const row=section.getByRole('row').filter({hasText:'2026-09-02'});
 await expect(row).toContainText('0건');await expect(row).toContainText('계산 불가');
 await expect(section.getByRole('row').filter({hasText:'2026-09-03'})).toHaveCount(0);
 await section.getByRole('button',{name:'CTR',exact:true}).click();
 await expect(section.getByRole('img',{name:'일별 CTR 추이'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await summary.evaluate(el=>Array.from(el.children).every(child=>child.getBoundingClientRect().right<=el.getBoundingClientRect().right+1))).toBe(true);
 expect(await section.evaluate(el=>Array.from(el.children).every(child=>child.getBoundingClientRect().right<=el.getBoundingClientRect().right+1))).toBe(true);
 await section.screenshot({path:test.info().outputPath('ad-daily-trend.png')});
});
test('registration collection failures do not produce reassuring totals',async({page})=>{
 await fixture(page,'ad-missing');
 const section=page.locator('section.admin-section').filter({has:page.getByRole('heading',{name:'일별 광고 성과',exact:true})});
 await expect(recruitment(page).getByText('미수집',{exact:true})).toHaveCount(2);
 await section.getByText('광고 일별 수치 보기',{exact:true}).click();
 await expect(section.getByRole('row').filter({hasText:'2026-09-04'})).toContainText('확인 필요');
 await section.getByRole('button',{name:'등록완료',exact:true}).click();
 await expect(section.getByRole('img',{name:'일별 등록완료 추이'}).locator('circle')).toHaveCount(1);
 await fixture(page,'ad-legacy');
 await expect(recruitment(page).getByText('확인 필요',{exact:true})).toHaveCount(2);
 await expect(recruitment(page).getByText('300건',{exact:true})).toHaveCount(0);
});
test('supplemental query failure and filter scope stay separate from working dashboard',async({page})=>{
 await fixture(page,'ad-error');
 await expect(page.getByText('일별 광고 자료를 불러오지 못했습니다. 기간을 줄이거나 다시 조회해 주세요.',{exact:true})).toBeVisible();
 await expect(recruitment(page).getByText('조회 실패',{exact:true})).toHaveCount(2);
 await expect(page.getByRole('heading',{name:'한눈에 보는 모집 성과',exact:true})).toBeVisible();
 await fixture(page);
 const filters=page.getByRole('region',{name:'무료클래스 조회 조건'});
 await filters.getByRole('button',{name:/^상세 필터/}).click();
 await filters.getByRole('button',{name:'레이아웃 버전',exact:true}).click();
 await filters.getByRole('group',{name:'레이아웃 버전 다중 선택'}).getByRole('checkbox').last().check();
 await expect(recruitment(page).getByText('필터 해제 필요',{exact:true})).toHaveCount(2);
 await expect(recruitment(page).getByText('30건',{exact:true})).toHaveCount(0);
 await expect(page.getByText(/일별 광고 성과는 상세 필터를 해제한/)).toBeVisible();
 await expect(page.getByRole('img',{name:'일별 광고비 추이'})).toHaveCount(0);
});
test('empty Meta data shows no fake zero cost or registration total',async({page})=>{
 await fixture(page,'empty');
 const section=page.locator('section.admin-section').filter({has:page.getByRole('heading',{name:'일별 광고 성과',exact:true})});
 await expect(recruitment(page).getByText('기록 없음',{exact:true})).toHaveCount(4);
 await expect(section.getByText('선택 지표를 계산할 수 있는 광고 자료가 없습니다.',{exact:true})).toBeVisible();
 await fixture(page,'ad-zero');
 await expect(recruitment(page).getByText('0건',{exact:true})).toBeVisible();
 await expect(recruitment(page).getByText('계산 불가',{exact:true})).toBeVisible();
 await expect(recruitment(page).getByText('등록 표본 30건 미만 · 판단 보류',{exact:true})).toBeVisible();
});
