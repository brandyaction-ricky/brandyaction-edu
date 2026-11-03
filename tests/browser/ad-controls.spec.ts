import {expect,test,type Page} from '@playwright/test';
const cohort='11111111-1111-4111-8111-111111111111';
const now='2026-11-04T03:00:00Z';
const policy={cohort_id:cohort,enabled:true,budget_krw:24000000,ads_start:'2026-10-19',ads_end:'2026-11-05',sales_end:'2026-11-08',mode:'auto',reason:'합성 기존 설정',override_until:null as string | null,revision:1,updated_at:now};
const control={freeze:true,freeze_source:'auto',freeze_reasons:['cpr_high'],override_until:null as string | null,cohort_code:'moonshot:5',cohort_budget_krw:24000000};
async function backend(page:Page,{manage=true,failure=false,off=false}={}){
 let p={...policy},c={...control},failed=failure;const writes:Record<string,unknown>[]=[];
 await page.route('**/api/admin/ad-controls',async route=>{
  if(route.request().method()==='GET'){
   if(failed){await route.fulfill({status:503,json:{error:'상태를 확인하지 못했습니다. 새로 확인해 주세요.'}});return;}
   await route.fulfill({json:{enabled:!off,canManage:manage,policies:[p],evidence:[{date_kst:'2026-11-04',cohort_id:cohort,cohort_code:'moonshot:5',policy:p,cpr_today:5000,cpr_previous:5000,spend_krw:100000,net_krw:400000,reserve_krw:null,refund_requests:0,control:c}],history:[{cohort_id:cohort,occurred_at:now,revision:p.revision,policy:p}],checkedAt:now}});return;
  }
  const body=route.request().postDataJSON();writes.push(body);p={...p,...body,revision:p.revision+1,override_until:body.mode==='freeze' && body.hours===null ? null : '2026-11-07T03:00:00Z'};
  c={...c,freeze:body.mode==='freeze',freeze_source:'manual',override_until:p.override_until};await route.fulfill({json:{policy:p}});
 });return {writes,recover:()=>{failed=false;}};
}
test('E5 displays one clear state with collapsible details and no horizontal overflow',async({page},info)=>{
 await backend(page);await page.goto('/ad-controls-test');await page.getByLabel('관리할 기수').selectOption(cohort);
 await expect(page.getByRole('status')).toContainText('광고비를 더 늘리지 않아요');await expect(page.getByText('판단 방식',{exact:true})).not.toBeVisible();
 await page.screenshot({path:info.outputPath('ad-controls-summary.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
test('E5 representative release includes reason/revision/72 hours and reloads the final state',async({page},info)=>{
 const b=await backend(page);await page.goto('/ad-controls-test');await page.getByLabel('관리할 기수').selectOption(cohort);await page.getByText('예산·판단 방식 설정',{exact:true}).click();
 await page.getByLabel('판단 방식',{exact:true}).selectOption('release');await expect(page.getByLabel('유지 시간 (최대 72시간)')).toHaveValue('72');
 await page.getByLabel('변경 사유',{exact:true}).fill('카톡방 수기 집계를 확인하고 대표가 합성 검수했습니다.');await page.getByRole('button',{name:'설정 저장',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('광고비 증액 제한을 풀었어요');expect(b.writes).toHaveLength(1);expect(b.writes[0]).toMatchObject({revision:1,hours:72,mode:'release',budget_krw:24000000});
 await page.getByText('변경 기록',{exact:true}).click();await expect(page.getByText('카톡방 수기 집계를 확인하고 대표가 합성 검수했습니다.',{exact:true}).last()).toBeVisible();
 await page.screenshot({path:info.outputPath('ad-controls-release.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
test('E5 ordinary admins can read but cannot change budget or override',async({page})=>{
 const b=await backend(page,{manage:false});await page.goto('/ad-controls-test');await page.getByLabel('관리할 기수').selectOption(cohort);await page.getByText('예산·판단 방식 설정',{exact:true}).click();
 await expect(page.getByLabel('기수 전체 광고 예산 (원)')).toBeDisabled();await expect(page.getByRole('button',{name:'설정 저장'})).toBeDisabled();expect(b.writes).toHaveLength(0);
});
test('E5 read failure shows a safe unknown state and retry, never stale release',async({page})=>{
 const b=await backend(page,{failure:true});await page.goto('/ad-controls-test');await page.getByLabel('관리할 기수').selectOption(cohort);await expect(page.getByRole('alert')).toContainText('상태를 확인하지 못했습니다');await expect(page.getByRole('status')).toContainText('광고비를 더 늘리지 않아요');
 b.recover();await page.getByRole('button',{name:'새로 확인'}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('status')).toContainText('4,500원');
});
test('E5 default disabled tells operators why setup is not available',async({page})=>{
 await backend(page,{off:true});await page.goto('/ad-controls-test');await expect(page.getByText('아직 연결을 켜지 않았어요.',{exact:false})).toBeVisible();await page.getByLabel('관리할 기수').selectOption(cohort);await page.getByText('예산·판단 방식 설정',{exact:true}).click();await expect(page.getByRole('button',{name:'설정 저장'})).toBeDisabled();
});

test('E5 indefinite freeze and editable thresholds remain understandable on all screen sizes',async({page},info)=>{
 const b=await backend(page);await page.goto('/ad-controls-test');await page.getByLabel('관리할 기수').selectOption(cohort);
 await page.getByText('예산·판단 방식 설정',{exact:true}).click();await page.getByLabel('판단 방식',{exact:true}).selectOption('freeze');
 await expect(page.getByLabel('직접 해제할 때까지 증액 막기')).toBeChecked();
 await expect(page.getByLabel('유지 시간 (최대 72시간)')).toHaveCount(0);
 await page.getByText('자동 동결 기준 변경',{exact:true}).click();
 await page.getByLabel('카톡방 입장 비용 기준 (원)').fill('6000');await page.getByLabel('기수 전체 ROAS 기준 (배)').fill('4.5');await page.getByLabel('하루 환불 요청 기준 (건)').fill('8');
 await page.getByLabel('변경 사유',{exact:true}).fill('대표가 기준을 확인한 뒤 직접 해제할 때까지 동결');
 await page.getByRole('button',{name:'설정 저장',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('직접 해제할 때까지');
 expect(b.writes[0]).toMatchObject({mode:'freeze',hours:null,cpr_limit_krw:6000,roas_floor:4.5,refund_request_limit:8});
 await page.getByText('판단 기준·입력값 보기',{exact:true}).click();
 await expect(page.getByText('판매 마감 전:',{exact:false})).toContainText('6,000원');
 await page.screenshot({path:info.outputPath('ad-controls-configured-freeze.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
 await page.getByLabel('판단 방식',{exact:true}).selectOption('release');await expect(page.getByLabel('유지 시간 (최대 72시간)')).toHaveValue('72');
});
