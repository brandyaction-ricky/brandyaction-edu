import {expect,test,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {newCalculatorBlock,RECIPE_INPUTS,MARGIN_INPUTS,type CalculatorType} from '../../lib/lesson-calculators';
import {validateBlockAnswers,type LessonBlockAnswers} from '../../lib/lesson-blocks';
const golden=JSON.parse(readFileSync('tests/fixtures/lesson-calculators-golden.json','utf8'));
async function backend(page:Page,kind:CalculatorType,stored:Record<string,string>={},historical=false){
  const document={schemaVersion:1 as const,blocks:[newCalculatorBlock(kind,'tool'),{id:'question',type:'question' as const,question:{label:'기존 질문',kind:'text' as const,required:false}}],checklist:[]};
  let values:LessonBlockAnswers={blocks:{tool:stored,question:'기존 답변'},checklist:[]},writeId='11111111-1111-4111-8111-111111111111';
  const writes:LessonBlockAnswers[]=[];
  await page.route('**/api/platform/lesson-blocks**',async route=>{
    if(route.request().method()==='GET'){await route.fulfill({json:{document,revision:'11111111-1111-4111-8111-111111111111',currentRevision:historical?'22222222-2222-4222-8222-222222222222':'11111111-1111-4111-8111-111111111111',draft:{values,writeId,updatedAt:'2026-09-29T00:00:00Z'},previousDrafts:[]}});return;}
    const body=route.request().postDataJSON();expect(body.action).toBe('draft');values=validateBlockAnswers(body.values,document);writeId=body.requestId;writes.push(values);await route.fulfill({json:{writeId,updatedAt:'2026-09-29T00:00:00Z'}});
  });return {values:()=>values,writes};
}
async function saved(page:Page){await expect(page.getByRole('status').filter({hasText:'답변 저장됨'})).toBeVisible();}

test('recipe shows original daily averages and details, restores all inputs and rejects invalid numbers',async({page},info)=>{
  const server=await backend(page,'recipe-calculator'),fixture=golden.recipe[1];
  await page.goto('/lesson-blocks-test');const panel=page.getByRole('region',{name:'레시피 실행 계산기'});
  for(const field of RECIPE_INPUTS)await panel.getByRole('spinbutton',{name:field.label}).fill(fixture.values[field.key]);
  for(const result of fixture.expected.results)await expect(panel.getByLabel(`${result.label} 결과`)).toHaveText(`${result.value.toLocaleString('ko-KR')} ${result.unit}`);
  await panel.getByRole('region',{name:'행동 데이터 획득',exact:true}).getByText('상세정보 펼쳐보기',{exact:true}).click();
  await expect(panel.getByRole('term').filter({hasText:'길찾기 수(추정치)'})).toBeVisible();
  await saved(page);expect(server.values().blocks.tool).toEqual(fixture.values);expect(server.values().blocks.question).toBe('기존 답변');
  await page.reload();for(const field of RECIPE_INPUTS)await expect(panel.getByRole('spinbutton',{name:field.label})).toHaveValue(fixture.values[field.key]);
  await panel.getByRole('spinbutton',{name:RECIPE_INPUTS[0].label}).fill('-1');await expect(panel.getByRole('alert')).toContainText('0 이상');
  await expect(panel.getByRole('spinbutton',{name:RECIPE_INPUTS[0].label})).toHaveValue('90');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.screenshot({path:info.outputPath('recipe.png')});
});
test('margin preserves original fees and tax results; channel preset changes save together and restore',async({page},info)=>{
  const server=await backend(page,'margin-calculator'),fixture=golden.margin[1];await page.goto('/lesson-blocks-test');const panel=page.getByRole('region',{name:'마진 계산기'});
  for(const [key,value]of Object.entries(fixture.values))await panel.getByRole('spinbutton',{name:MARGIN_INPUTS.find(f=>f.key===key)!.label,exact:true}).fill(value as string);
  await expect(panel.getByLabel('예상 정산금액')).toHaveText(`${Math.round(fixture.expected.settlement).toLocaleString('ko-KR')} 원`);
  await expect(panel.getByLabel('예상 순이익')).toHaveText(`${Math.round(fixture.expected.netProfit).toLocaleString('ko-KR')} 원`);
  await expect(panel.getByLabel('마진율',{exact:true})).toHaveText(`${(Math.round(fixture.expected.marginRate*10)/10).toLocaleString('ko-KR')}%`);
  await panel.getByRole('combobox',{name:'과세 유형'}).selectOption('면세 사업자');
  await expect(panel.getByLabel('예상 순이익')).toHaveText(`${Math.round(golden.margin[2].expected.netProfit).toLocaleString('ko-KR')} 원`);
  await panel.getByRole('combobox',{name:'판매 채널'}).selectOption('직접 입력');
  await panel.getByRole('spinbutton',{name:'카테고리 수수료',exact:true}).fill('9');await panel.getByRole('spinbutton',{name:'연동 수수료',exact:true}).fill('7');await panel.getByRole('spinbutton',{name:'배송비 수수료',exact:true}).fill('8');
  await saved(page);await panel.getByRole('combobox',{name:'판매 채널'}).selectOption('스마트스토어');await saved(page);
  expect(server.values().blocks.tool).toMatchObject({...fixture.values,categoryFee:'3.63',linkFee:'3',deliveryFeeRate:'3.63',channel:'스마트스토어',vatType:'면세 사업자'});
  await page.reload();await expect(panel.getByRole('combobox',{name:'과세 유형'})).toHaveValue('면세 사업자');await expect(panel.getByRole('spinbutton',{name:'판매가격',exact:true})).toHaveValue('10000');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.screenshot({path:info.outputPath('margin.png')});
});
test('funnel stages reorder, add and remove without changing ids; a real PNG downloads and zero base is explicit',async({page},info)=>{
  const server=await backend(page,'marketing-funnel');await page.goto('/lesson-blocks-test');const panel=page.getByRole('region',{name:'마케팅 퍼널 만들기'});
  await expect(panel.locator('[data-funnel-stage]')).toHaveCount(6);
  await panel.getByRole('spinbutton',{name:'단계 2 수',exact:true}).fill('250');await panel.getByRole('button',{name:'단계 추가',exact:true}).click();
  const newName='잠재 고객이 무료 자료를 받고 상담을 신청한 다음 유료 강좌를 구매하는 단계';
  await panel.getByRole('textbox',{name:'단계 7 이름',exact:true}).fill(newName);await panel.getByRole('spinbutton',{name:'단계 7 수',exact:true}).fill('4');
  const newId=await panel.locator('[data-funnel-stage]').last().getAttribute('data-funnel-stage');
  await panel.getByRole('button',{name:'단계 7 위로',exact:true}).click();page.once('dialog',d=>d.accept());await panel.getByRole('button',{name:'단계 7 삭제',exact:true}).click();
  await saved(page);const stages=JSON.parse((server.values().blocks.tool as Record<string,string>).data);expect(stages.map((s:{id:string})=>s.id)).toEqual(['s1','s2','s3','s4','s5',newId]);expect(stages[5].name).toBe(newName);
  await page.reload();await expect(panel.getByRole('textbox',{name:'단계 6 이름',exact:true})).toHaveValue(newName);await expect(panel.getByRole('figure')).toContainText('25%');
  const download=page.waitForEvent('download');await panel.getByRole('button',{name:'퍼널 이미지 다운로드',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe('marketing-funnel.png');const path=info.outputPath('funnel.png');await file.saveAs(path);
  const png=readFileSync(path);expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(760);expect(png.readUInt32BE(20)).toBeGreaterThan(600);expect(png.length).toBeGreaterThan(10000);
  await expect(panel.getByRole('button',{name:'퍼널 이미지 다운로드',exact:true})).toBeEnabled();
  await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};});
  await panel.getByRole('button',{name:'퍼널 이미지 다운로드',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('다운로드에 실패');
  await panel.getByRole('spinbutton',{name:'단계 1 수',exact:true}).fill('0');await expect(panel.getByText('첫 단계 값이 0이어서 전체 전환율은 계산할 수 없습니다.')).toBeVisible();await saved(page);
  expect(server.values().blocks.question).toBe('기존 답변');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.screenshot({path:info.outputPath('funnel-screen.png')});
});
for(const type of ['recipe-calculator','margin-calculator','marketing-funnel'] as const)test(`${type} historical state cannot be edited and empty inputs are identified`,async({page})=>{
  const server=await backend(page,type,{},true);await page.goto('/lesson-blocks-test');
  await expect(page.getByText('아직 입력한 데이터가 없습니다. 아래에는 기본값이 표시됩니다.')).toBeVisible();
  for(const input of await page.getByRole('spinbutton').all())expect(await input.evaluate(el=>(el as HTMLInputElement).readOnly || (el as HTMLInputElement).matches(':disabled'))).toBe(true);
  if(type==='marketing-funnel'){await expect(page.getByRole('button',{name:'단계 추가',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'퍼널 이미지 다운로드',exact:true})).toBeEnabled();}
  expect(server.writes).toHaveLength(0);
});
test('corrupt saved funnel data is not silently replaced with the default example',async({page})=>{
  for(const stored of [{data:'corrupt-record'},'corrupt-record',null,[]]){
    await page.unroute('**/api/platform/lesson-blocks**');
    const server=await backend(page,'marketing-funnel',stored as Record<string,string>);
    await page.goto('/lesson-blocks-test');
    await expect(page.getByRole('alert')).toContainText('기존 값을 보존');
    await expect(page.getByRole('button',{name:'단계 추가',exact:true})).toHaveCount(0);
    expect(server.writes).toHaveLength(0);
  }
});
