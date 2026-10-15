import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, mode: 'ready' | 'failure' | 'empty' = 'ready') {
  const campaign = { id:'bbbbbbbb-bbbb-4000-8000-000000000002',landing_id:'aaaaaaaa-aaaa-4000-8000-000000000001',name:'광고 분석 검수',utm_campaign:'qa',start_day:'2026-09-01',end_day:'2026-09-30',new_customer_price:1650000,existing_customer_price:1100000,live_peak:null,uses_ads:true,meta_ad_account_id:'act_123456',meta_campaign_ids:['123456789'],meta_sync_status:'success',meta_last_synced_at:'2026-10-15T00:00:00Z',meta_sync_error:null };
  const version=(v:number,n=20,cta=4)=>({layout_ver:v,created_at:`2026-09-${v===1?'01':'15'}T00:00:00Z`,note:v===1?'기존 페이지':'가격 설명 보완',sessions:n,cta_sessions:cta,first_seen:'2026-09-15T00:00:00Z',last_seen:'2026-09-15T03:00:00Z',sections:[{section:'hero',reached:n,not_continued:2,avg_dwell_ms:100},{section:'detail',reached:n-2,not_continued:null,avg_dwell_ms:100}]});
  const revenue={state:mode==='empty'?'unmapped':'ready',cohort_id:'cccccccc-cccc-4000-8000-000000000003',cohort_label:'시험 강의 · 4기',orders:2,new_orders:1,existing_orders:1,gross:1300000,refunds:200000,net:1100000,spend:100000,roas:1100,needs_review:0};
  const behavior={sessions:40,measured_sessions:mode==='empty'?0:30,scroll:[{depth:0,reached:30,not_continued:10},{depth:50,reached:20,not_continued:5},{depth:100,reached:15,not_continued:null}],versions:mode==='empty'?[]:[version(1),version(2,20,8)]};
  let failed=false;
  await page.route('**/api/landing/performance**', async route=>{
    const url=new URL(route.request().url());
    if(!url.searchParams.has('start'))return route.fulfill({json:{can_manage_campaign:true,courses:[{id:campaign.landing_id,title:'시험 무료클래스',status:'published',tracking:'active',campaigns:[campaign,{...campaign,id:'dddddddd-dddd-4000-8000-000000000004',name:'추가 페이지'}]}]}});
    const fail=mode==='failure'&&!failed;failed=true;
    const report={financial_mode:'orders',campaign,source_title:'시험 무료클래스',summary_b:{has_data:true,sessions:40,visitors:30,cta_click_sessions:12,cta_clicks:20,converted_visitors:10,spend:100000,meta_impressions:1000,meta_link_clicks:100},summary_a:null,actuals:[],daily:[],performance:[],options:{campaigns:[],adsets:[],creatives:[],devices:[],layouts:[1,2],ad_types:[]},data_state:{sessions_exist:true,filtered_sessions_exist:true,meta_exists:true},campaign_summary:{kakao_members:100,kakao_delta:20,new_payments:99,existing_payments:99,revenue:999999999,spend:100,roas:99999999,live_peak:null},ui:{insights:fail?null:{revenue,behavior},errors:fail?{insights:'자동 매출·행동 분석을 불러오지 못했습니다. 다시 조회해 주세요.'}:{},daily_a:null,last_collected_at:null,actual_presence:{new_payments:true,existing_payments:true},previous_day_members:{},period_actuals:{payments:198,kakao_delta:20}},range:{startDay:url.searchParams.get('start'),endDay:url.searchParams.get('end'),compareStartDay:null,compareEndDay:null}};
    return route.fulfill({json:url.searchParams.getAll('campaign').length>1?{multi:true,reports:[report,{...report,campaign:{...campaign,id:'dddddddd-dddd-4000-8000-000000000004'},source_title:'추가 페이지'}]}:report});
  });
  await page.goto('/admin/landing?preset=custom&start=2026-09-01&end=2026-09-30');
  await expect(page.getByRole('heading',{name:/전환 퍼널|한눈에 보는 모집 성과/})).toBeVisible();
}

test('automatic revenue, measured scroll denominators and selectable published version comparisons',async({page})=>{
 await fixture(page);
 await expect(page.getByRole('heading',{name:'기수 전체 매출 · 주문 자동 집계'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'순매출',exact:true})).toBeVisible();
 await expect(page.getByRole('article').filter({has:page.getByRole('heading',{name:'순매출',exact:true})}).getByText('1,100,000원',{exact:true})).toBeVisible();
 await page.locator('section.admin-section').filter({has:page.getByRole('heading',{name:'기수 전체 매출 · 주문 자동 집계',exact:true})}).screenshot({path:`test-results/landing-insights-revenue-${test.info().project.name}.png`});
 await expect(page.getByRole('region',{name:'스크롤 구간별 도달과 이탈'})).toContainText('33.3%');
 await expect(page.getByText('CTA 클릭률 변화 +20.0%p',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'비교 버전',exact:true}).selectOption('1');
 await expect(page.getByText('서로 다른 버전을 선택해 주세요.',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'비교 버전',exact:true}).selectOption('2');
 await page.getByText('섹션별 도달 확인',{exact:true}).click();
 await expect(page.getByRole('region',{name:'섹션별 도달과 미진행'})).toContainText('hero');
 await page.getByText('섹션별 변경 전후 도달률',{exact:true}).click();
 await expect(page.getByRole('region',{name:'버전별 섹션 도달 비교'})).toContainText('detail');
 await page.getByText('상세 지표 · Meta 성과 · 누적 성과',{exact:true}).click();
 await expect(page.getByText('999,999,999원',{exact:true})).toHaveCount(0);
 await expect(page.getByText('NaN',{exact:true})).toHaveCount(0);
 await page.screenshot({path:`test-results/landing-insights-${test.info().project.name}.png`,fullPage:true});
});

test('supplement failure does not show manual financial values and explicit retry restores analysis',async({page})=>{
 await fixture(page,'failure');
 await expect(page.getByText('자동 매출·행동 분석을 불러오지 못했습니다. 다시 조회해 주세요.',{exact:true})).toBeVisible();
 await expect(page.getByText('999,999,999원',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'새로고침',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'기수 전체 매출 · 주문 자동 집계'})).toBeVisible();
});

test('missing mapping and unmeasured visits explain why metrics cannot be computed',async({page})=>{
 await fixture(page,'empty');
 await expect(page.getByText(/연결된 유료 기수가 없습니다/)).toBeVisible();
 await expect(page.getByText(/스크롤 측정값이 없습니다/)).toBeVisible();
 await expect(page.getByText(/비교할 두 번째 페이지 버전이 아직 없습니다/)).toBeVisible();
 await expect(page.getByText('1,100,000원',{exact:true})).toHaveCount(0);
});
