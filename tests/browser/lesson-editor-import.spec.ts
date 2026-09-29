import { detailedAuthor } from './helpers/detailed-author';
import { expect, test, type Page } from '@playwright/test';

// Existing field-level regressions exercise the retained detailed settings.
test.beforeEach(async ({ page }) => detailedAuthor(page));
import type { LessonBlockDocument } from '../../lib/lesson-blocks';
import { newGuidedBlock } from '../../lib/lesson-guided-tools';
import { newCalculatorBlock } from '../../lib/lesson-calculators';

const id=(n:number)=>`aaaaaaab-1111-4111-8111-${String(n).padStart(12,'0')}`;
const source:LessonBlockDocument={schemaVersion:1,blocks:[{id:'source-question',type:'question',question:{label:'복사할 질문',kind:'text',required:true}}, {id:'source-quiz',type:'quiz',content:'원본 시험',quiz:{passPercent:100,questions:[{id:'source-q',prompt:'맞는 것을 고르세요',options:['예','아니오'],correctIndex:0}]}},newGuidedBlock('persona-generator','source-persona'),newCalculatorBlock('margin-calculator','source-margin'),{id:'source-image',type:'image',assetId:id(40),alt:'원본 비공개 이미지'}],checklist:[{id:'source-check',label:'원본 체크',required:true}],completion:{mode:'mentor',requireAnswers:true,requireQuizPass:true},progression:{track:'daily',dayNumber:2}};
const text=['Day 3','가져온 학습','안내 본문','---','Q','도울 고객은 누구인가요?','','맞춤형 프롬프트 생성기','고객','예시) 점주','Prompt','복사하기','```','{고객}에게 안내해 주세요','```','쪽지시험','문항 1','첫 단계는 무엇인가요?','1. 고객 파악','2. 광고','3. 판매','4. 정산','정답 : 1','---','미션 체크리스트','실행했습니다 *'].join('\n');

async function setup(page:Page){
 let saved:LessonBlockDocument|null=null,revision:string|null=null,sourceMode='ok';const writes:LessonBlockDocument[]=[];
 await page.route('**/api/platform/lesson-blocks**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='POST'){saved=req.postDataJSON().document;revision=req.postDataJSON().requestId;writes.push(saved!);await route.fulfill({json:{revision}});return;}
  if(url.searchParams.get('action')==='progression'){await route.fulfill({json:{lessons:[{lessonId:id(4),isUnlocked:true,track:null,dayNumber:null,automaticApproval:false,reason:''}]}});return;}
  const lesson=url.searchParams.get('lesson');if(lesson===id(8)||lesson===id(9)){
   if(sourceMode==='error'){await route.fulfill({status:503,json:{error:'원본 조회 실패'}});return;}
   await route.fulfill({json:{editable:sourceMode!=='denied',document:sourceMode==='empty'?null:lesson===id(8)?source:{schemaVersion:1,blocks:[{id:'other',type:'text',content:'두 번째 원본'}],checklist:[]},revision:id(70)}});return;
  }
  const student=url.searchParams.has('enrollment'),document=saved&&structuredClone(saved);if(student&&document)for(const b of document.blocks)if(b.quiz)for(const q of b.quiz.questions)Reflect.deleteProperty(q,'correctIndex');
  await route.fulfill({json:{document,revision,currentRevision:revision,editable:!student,draft:null,previousDrafts:[]}});
 });
 await page.goto('/lesson-block-author-test?imports');await page.getByRole('button',{name:'여러 항목으로 구성하기'}).click();
 return{writes,document:()=>saved,setSourceMode:(mode:string)=>{sourceMode=mode;}};
}
async function openText(page:Page,value=text){await page.getByRole('button',{name:'텍스트·파일 가져오기'}).click();await page.getByRole('textbox',{name:'가져올 텍스트'}).fill(value);await page.getByRole('button',{name:'가져올 내용 확인'}).click();}

test('text preview append save reload and student display preserve questions, generators and hidden quiz keys',async({page},info)=>{
 const server=await setup(page);await openText(page);
 await expect(page.getByRole('dialog')).toContainText('카드 7개 · 체크리스트 1개');expect(server.writes).toHaveLength(0);
 await page.getByRole('button',{name:'뒤에 추가',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('[data-author-block]')).toHaveCount(8);
 await expect(page.getByRole('textbox',{name:'체크 항목 1'})).toHaveValue('실행했습니다');
 await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.',{exact:true})).toBeVisible();
 expect(server.document()!.blocks[0].id).toBe('legacy-body');expect(server.document()!.blocks.at(-2)!.quiz!.questions[0].correctIndex).toBe(0);
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.locator('[data-author-block]')).toHaveCount(8);
 await page.getByRole('button',{name:'학생 화면 보기'}).click();await expect(page.getByRole('heading',{name:'가져온 학습',exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'도울 고객은 누구인가요?'})).toBeVisible();await expect(page.getByRole('radio',{name:'고객 파악'})).toBeVisible();await expect(page.getByText('정답 : 1',{exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:'실행했습니다'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('imported-lesson-student.png'),fullPage:true});
});

test('replace requires a decision, can be undone, and unrelated edits never get erased by undo',async({page})=>{
 await setup(page);await page.getByRole('combobox',{name:'학습 개방 방식'}).selectOption('daily');await page.getByRole('spinbutton',{name:'전체 과정에서 몇 일차인가요?'}).fill('7');
 await openText(page,'# 교체할 제목\n새 본문');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'전체 교체',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'전체 교체',exact:true}).click();await expect(page.locator('[data-author-block]')).toHaveCount(2);await expect(page.getByRole('spinbutton',{name:'전체 과정에서 몇 일차인가요?'})).toHaveValue('7');
 await page.getByRole('button',{name:'마지막 가져오기 되돌리기'}).click();await expect(page.locator('[data-author-block]')).toHaveCount(1);await expect(page.locator('[data-author-block]').first()).toContainText('원래 본문');
 await openText(page,'Q\n새 질문');await page.getByRole('button',{name:'뒤에 추가',exact:true}).click();await page.getByRole('textbox',{name:'질문 문구'}).fill('추가 편집');await expect(page.getByRole('button',{name:'마지막 가져오기 되돌리기'})).toHaveCount(0);
});

test('UTF8 file import and malformed input expose errors without changing the current lesson',async({page})=>{
 const server=await setup(page);await page.getByRole('button',{name:'텍스트·파일 가져오기'}).click();
 await page.getByLabel('텍스트 파일 선택').setInputFiles({name:'lesson.txt',mimeType:'text/plain',buffer:Buffer.from('Day 5\n파일 학습\n[이미지 삽입 : 예시]')});await expect(page.getByRole('textbox',{name:'가져올 텍스트'})).toContainText('파일 학습');
 await page.getByRole('button',{name:'가져올 내용 확인'}).click();await expect(page.getByRole('dialog')).toContainText('이미지 자리만 가져왔습니다');await page.getByRole('button',{name:'뒤에 추가',exact:true}).click();await page.getByRole('button',{name:'학습 저장',exact:true}).click();expect(server.writes).toHaveLength(0);await expect(page.getByRole('alert')).toContainText('필수 항목');
 await page.getByRole('button',{name:'텍스트·파일 가져오기'}).click();await page.getByLabel('텍스트 파일 선택').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from([0xc3,0x28])});await expect(page.getByRole('dialog').getByRole('alert')).toContainText('UTF-8');
 await page.getByRole('textbox',{name:'가져올 텍스트'}).fill('쪽지시험\n문항 1\n질문\nA\nB\nC\nD\n정답 : 9');await page.getByRole('button',{name:'가져올 내용 확인'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('번째 줄');
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'텍스트·파일 가져오기'})).toBeFocused();await expect(page.locator('[data-author-block]')).toHaveCount(3);
});

test('selected cards insert in source order with new IDs and preserve built-in tools and private media',async({page},info)=>{
 const server=await setup(page);await page.getByRole('button',{name:'다른 학습 카드 가져오기'}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('checkbox',{name:'원본 카드 1: 중간 질문'})).toBeVisible();await page.screenshot({path:info.outputPath('card-import-selection.png')});
 await expect(dialog.getByRole('combobox',{name:'가져올 학습'})).not.toContainText('다른 상품 비공개');
 await dialog.getByRole('checkbox',{name:'원본 카드 2: 확인 문제'}).check();await dialog.getByRole('checkbox',{name:'원본 카드 1: 중간 질문'}).check();await dialog.getByRole('button',{name:'맨 앞에 붙여넣기'}).click();await expect(dialog.getByRole('status')).toContainText('2개 카드');
 for(const n of [3,4,5])await dialog.getByRole('checkbox',{name:new RegExp(`원본 카드 ${n}:`)}).check();await dialog.getByRole('button',{name:'맨 뒤에 붙여넣기'}).click();expect(server.writes).toHaveLength(0);
 await page.screenshot({path:info.outputPath('card-import-mobile.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await dialog.getByRole('button',{name:'닫기',exact:true}).last().click();await page.getByRole('button',{name:'학습 저장',exact:true}).click();await expect(page.getByText('학습 기본 정보와 콘텐츠를 저장했습니다.',{exact:true})).toBeVisible();
 const saved=server.document()!;expect(saved.blocks.map(b=>b.type)).toEqual(['question','quiz','text','persona-generator','margin-calculator','image']);expect(saved.blocks[0].id).not.toBe('source-question');expect(saved.blocks[1].quiz!.questions[0].id).not.toBe('source-q');expect(saved.blocks[3].fields).toEqual(source.blocks[2].fields);expect(saved.blocks[5].assetId).toBe(id(40));expect(saved.checklist).toEqual([]);expect(saved.progression).toBeUndefined();
});

test('switching source clears selection and current unsaved cards can be copied without a source write',async({page})=>{
 const server=await setup(page);await openText(page,'Q\n아직 저장하지 않은 질문');await page.getByRole('button',{name:'뒤에 추가',exact:true}).click();
 await page.getByRole('button',{name:'다른 학습 카드 가져오기'}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:'원본 카드 1: 중간 질문'}).check();await dialog.getByRole('combobox',{name:'가져올 학습'}).selectOption(id(9));await expect(dialog.getByText('두 번째 원본',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'맨 앞에 붙여넣기'})).toBeDisabled();
 await dialog.getByRole('combobox',{name:'가져올 학습'}).selectOption(id(4));await dialog.getByRole('checkbox',{name:'원본 카드 2: 중간 질문'}).check();await dialog.getByRole('button',{name:'1번 카드 뒤에 붙여넣기'}).click();await dialog.getByRole('button',{name:'닫기',exact:true}).last().click();await expect(page.getByRole('textbox',{name:'질문 문구'})).toHaveCount(2);expect(server.writes).toHaveLength(0);
 const ids=await page.locator('[data-author-block]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-author-block')));expect(new Set(ids).size).toBe(3);
});

test('failed, empty and unauthorized sources do not modify or enable copying; retry can recover',async({page})=>{
 const server=await setup(page);server.setSourceMode('error');await page.getByRole('button',{name:'다른 학습 카드 가져오기'}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('alert')).toContainText('원본 조회 실패');
 server.setSourceMode('denied');await dialog.getByRole('button',{name:'학습 다시 불러오기'}).click();await expect(dialog.getByRole('alert')).toContainText('편집 권한');await expect(dialog.getByRole('checkbox')).toHaveCount(0);
 server.setSourceMode('empty');await dialog.getByRole('button',{name:'학습 다시 불러오기'}).click();await expect(dialog).toContainText('저장된 학습 카드가 없습니다');await expect(dialog.getByRole('button',{name:'맨 앞에 붙여넣기'})).toBeDisabled();
 await dialog.getByRole('button',{name:'닫기',exact:true}).last().click();server.setSourceMode('ok');await page.getByRole('button',{name:'다른 학습 카드 가져오기'}).click();await dialog.getByRole('button',{name:'전체 선택',exact:true}).click();await expect(dialog.getByRole('checkbox').first()).toBeChecked();await dialog.getByRole('button',{name:'전체 해제',exact:true}).click();await expect(dialog.getByRole('button',{name:'맨 앞에 붙여넣기'})).toBeDisabled();expect(server.writes).toHaveLength(0);
});

test('dragging a card inserts it at the requested location',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Touch devices use the equivalent select-and-insert buttons.');await setup(page);await page.getByRole('button',{name:'다른 학습 카드 가져오기'}).click();const dialog=page.getByRole('dialog');
 const card=dialog.locator('.lei-card').first();await expect(card).toBeVisible();await card.dragTo(dialog.getByRole('button',{name:'맨 뒤에 붙여넣기'}));await expect(dialog.getByRole('status')).toContainText('1개 카드');
});
