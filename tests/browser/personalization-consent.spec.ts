import { test, expect, type Page } from '@playwright/test';
const empty={analysis:false,overseas:false};
const terms={version:'qa-v1',analysis:'검수용 안내입니다. 구매·학습 기록으로 이용 패턴과 이탈 가능성을 분석합니다. 이름·연락처와 N6 진단·보고서는 전송하지 않습니다. 동의 취소 또는 탈퇴 시까지 이용합니다.',overseas:'검수용 가상 고지입니다. 실제 운영 고지가 아닙니다. 수탁자·국가·항목·이전 시기와 방법·목적·보유 기간·거부 방법은 운영 전 확정합니다.'};
async function backend(page:Page,options:{existing?:boolean;lost?:boolean;conflict?:boolean;unready?:boolean;renewal?:boolean}={}){
 let state={choices:options.existing?{analysis:true,overseas:true}:empty,revision:options.existing?'11111111-1111-4111-8111-111111111111':null as string|null,updatedAt:null,terms:options.unready?null:terms,accepting:!options.unready,needsRenewal:!!options.renewal,eligible:!!options.existing&&!options.renewal&&!options.unready};
 const writes:Record<string,unknown>[]=[];let lost=options.lost;
 await page.route('**/api/account/personalization-consent',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:state});return;}
  const body=route.request().postDataJSON();writes.push(body);
  if(options.conflict){await route.fulfill({status:409,json:{error:'다른 화면에서 설정이 바뀌었어요. 저장된 설정을 다시 불러와 주세요.'}});return;}
  state={...state,revision:body.requestId,choices:body.choices,needsRenewal:false,eligible:body.choices.analysis&&body.choices.overseas};
  if(lost){lost=false;await route.abort();return;}await route.fulfill({json:state});
 });
 return{writes};
}
const panel=(page:Page)=>page.getByRole('region',{name:'내게 맞는 학습·혜택 안내'});
async function open(page:Page){await page.goto('/personalization-consent-test');await panel(page).getByRole('button',{name:'선택 항목 보기'}).click();}
test('optional choices are collapsed, unchecked and never saved on open/close',async({page},info)=>{
 const b=await backend(page);await page.goto('/personalization-consent-test');await expect(panel(page).getByRole('button',{name:'선택 항목 보기'})).toBeVisible();
 await expect(panel(page).getByRole('checkbox')).toHaveCount(0);await page.screenshot({path:info.outputPath('personalization-collapsed.png'),fullPage:true});
 await panel(page).getByRole('button',{name:'선택 항목 보기'}).click();for(const box of await panel(page).getByRole('checkbox').all())await expect(box).not.toBeChecked();
 await expect(panel(page).getByRole('button',{name:'선택 저장',exact:true})).toBeDisabled();
 await panel(page).getByRole('checkbox',{name:/구매·학습 기록 분석/}).check();expect(b.writes).toHaveLength(0);
 await panel(page).getByRole('button',{name:'변경하지 않고 닫기'}).click();expect(b.writes).toHaveLength(0);
 await panel(page).getByRole('button',{name:'선택 항목 보기'}).click();await expect(panel(page).getByRole('checkbox',{name:/구매·학습 기록 분석/})).not.toBeChecked();
 await page.screenshot({path:info.outputPath('personalization-expanded.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('separate choices save explicitly and do not opt the member into advertising',async({page})=>{
 const b=await backend(page);await open(page);await panel(page).getByRole('checkbox',{name:/구매·학습 기록 분석/}).check();
 await panel(page).getByRole('button',{name:'선택 저장',exact:true}).click();await expect(panel(page).getByRole('status')).toContainText('광고 수신 설정은 바뀌지');
 expect(b.writes[0].choices).toEqual({analysis:true,overseas:false});
 await expect(page.getByRole('checkbox',{name:/카카오톡 광고 받기/})).not.toBeChecked();
});
test('lost response retries the same request; withdrawal works without current approved terms',async({page})=>{
 const b=await backend(page,{existing:true,lost:true,unready:true});await page.goto('/personalization-consent-test');
 await panel(page).getByRole('button',{name:'분석·국외 이전 동의 취소'}).click();await expect(panel(page).getByRole('alert')).toBeVisible();
 await panel(page).getByRole('button',{name:'같은 선택 다시 저장'}).click();await expect(panel(page).getByRole('status')).toContainText('모두 취소');
 expect(b.writes[0]).toEqual(b.writes[1]);expect(b.writes[0].choices).toEqual(empty);
});
test('new terms require an unchecked fresh choice; stale writes require reload',async({page})=>{
 const b=await backend(page,{existing:true,renewal:true,conflict:true});await open(page);
 for(const box of await panel(page).getByRole('checkbox').all())await expect(box).not.toBeChecked();
 await panel(page).getByRole('checkbox',{name:/구매·학습 기록 분석/}).check();await panel(page).getByRole('button',{name:'선택 저장',exact:true}).click();
 await expect(panel(page).getByRole('alert')).toContainText('다른 화면');await expect(panel(page).getByRole('button',{name:'같은 선택 다시 저장'})).toHaveCount(0);expect(b.writes).toHaveLength(1);
});
test('unapproved disclosure cannot collect consent',async({page})=>{
 const b=await backend(page,{unready:true});await page.goto('/personalization-consent-test');
 await expect(page.getByRole('region',{name:'소식 수신 설정'})).toBeVisible();
 await expect(panel(page)).toHaveCount(0);expect(b.writes).toHaveLength(0);
});
