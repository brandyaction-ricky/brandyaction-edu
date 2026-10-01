import {expect,test,type Page} from '@playwright/test';
import {detailedAuthor} from './helpers/detailed-author';
import type {AuthorPayload,AuthorSnapshot} from '../../lib/lesson-author-drafts';
const id=(n:number)=>`aaaaaaab-1111-4111-8111-${String(n).padStart(12,'0')}`;
const payload=():AuthorPayload=>({form:{basic:{week_id:id(5),day_number:'1',title:'공개된 수업',description:'',duration_label:'10분',is_published:true,is_preview:false},format:'text',bodyText:'원래 본문',videoUrl:'',externalUrl:'',resourceName:'',resourcePath:''},blocks:{active:true,document:{schemaVersion:1,blocks:[{id:'original',type:'text',content:'학생이 보는 원래 본문'}],checklist:[]}}});
async function backend(page:Page){
 let state:AuthorSnapshot={lessonId:id(4),revision:null,publishedRevision:null,publishedStamp:null,baseStamp:'a'.repeat(32),payload:payload(),public:{stamp:'a'.repeat(32),payload:payload(),blockRevision:id(70)},history:[]};
 const versions=new Map<string,AuthorPayload>([[id(71),payload()]]), writes:Record<string,unknown>[]=[];let failSave=0,failPublish=0;
 await page.route('**/api/admin/lesson-author**',async route=>{
  if(route.request().method()==='GET'){const v=new URL(route.request().url()).searchParams.get('version');await route.fulfill({json:v?{payload:versions.get(v),revision:v}:state});return;}
  const body=route.request().postDataJSON();writes.push(body);
  if(body.action==='save'){
   if(failSave===409){failSave=0;await route.fulfill({status:409,json:{error:'다른 화면에서 초안을 저장했습니다.'}});return;}
   if(body.expectedRevision!==state.revision){await route.fulfill({status:409,json:{error:'저장 충돌'}});return;}
   if(!state.revision)state.history.push({revision:id(71),title:'공개된 수업',createdAt:'2026-10-01T05:00:00Z',baseline:true,published:false});
   state={...state,lessonId:body.lessonId,revision:body.requestId,payload:structuredClone(body.payload),baseStamp:state.public.stamp};versions.set(body.requestId,structuredClone(body.payload));state.history.unshift({revision:body.requestId,title:body.payload.form.basic.title,createdAt:'2026-10-01T06:00:00Z',baseline:false,published:false});
   if(failSave){const status=failSave;failSave=0;await route.fulfill({status,json:{error:'저장 응답을 확인하지 못했습니다.'}});return;}
   await route.fulfill({json:{revision:body.requestId}});return;
  }
  if(failPublish){const status=failPublish;failPublish=0;await route.fulfill({status,json:{error:'파일 연결을 확인해 주세요.'}});return;}
  state={...state,publishedRevision:state.revision,publishedStamp:'b'.repeat(32),public:{stamp:'b'.repeat(32),payload:structuredClone(state.payload),blockRevision:body.requestId}};state.history=state.history.map(x=>({...x,published:x.published||x.revision===state.revision}));await route.fulfill({json:{revision:body.revision,published:true}});
 });
 await page.route('**/api/admin/ongoing-lessons**',r=>r.fulfill({json:{setting:null}}));
 return{writes,get:()=>state,failSave:(n:number)=>failSave=n,failPublish:(n:number)=>failPublish=n};
}
test.beforeEach(async({page})=>{await detailedAuthor(page);page.on('dialog',d=>d.accept());});
const save=(page:Page)=>page.getByRole('button',{name:'초안 저장',exact:true});
const publish=(page:Page)=>page.getByRole('button',{name:'학생 화면에 반영',exact:true});
async function open(page:Page){await page.goto('/lesson-block-author-test?serverDraft=1');await expect(save(page)).toBeEnabled();}

test('server draft survives reopening and publishes only after explicit action; history restores without changing students',async({page},info)=>{
 const server=await backend(page);await open(page);await page.getByLabel('제목 *',{exact:true}).fill('편집한 제목');await save(page).click();await expect(page.getByText('서버에 초안을 저장했습니다. 학생 화면은 바뀌지 않았습니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('편집한 제목');await expect(page.getByLabel('기본 정보 저장 횟수')).toHaveText('0');await expect(page.getByLabel('기존 본문 변경 횟수')).toHaveText('0');
 await publish(page).click();await expect(page.getByText('학생 화면에 반영했습니다. 공개 범위는 선택한 설정을 따릅니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.form.basic.title).toBe('편집한 제목');
 await page.getByText(/^이전 초안·반영 이력/).click();await page.locator('.lesson-author-history').filter({hasText:'기존 공개본'}).getByRole('button').click();await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('공개된 수업');expect(server.get().public.payload.form.basic.title).toBe('편집한 제목');await save(page).click();await expect(save(page)).toBeEnabled();expect(server.get().public.payload.form.basic.title).toBe('편집한 제목');
 await page.locator('.lesson-publication-panel').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('lesson-draft-history.png'),fullPage:false});
});
test('unfinished questions can be saved and reopened, but cannot be published',async({page})=>{
 const server=await backend(page);await open(page);await page.getByRole('combobox',{name:'추가할 항목'}).selectOption('question');await page.getByRole('button',{name:'항목 추가',exact:true}).click();await page.getByLabel('제목 *',{exact:true}).fill('');await save(page).click();await expect(page.getByText('서버에 초안을 저장했습니다. 학생 화면은 바뀌지 않았습니다.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(page.getByLabel('질문 문구')).toHaveValue('');await publish(page).click();expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);expect(server.get().public.payload.blocks.document.blocks).toHaveLength(1);
});
test('lost save response prevents blind overwrite and latest server draft can be recovered',async({page})=>{
 const server=await backend(page);await open(page);server.failSave(503);await page.getByLabel('제목 *',{exact:true}).fill('응답 전에 저장된 내용');await save(page).click();await expect(save(page)).toBeDisabled();await expect(publish(page)).toBeDisabled();await expect(page.getByRole('region',{name:'초안과 학생 공개본'}).getByRole('button',{name:'편집 내용 내려받기',exact:true})).toBeEnabled();expect(server.writes).toHaveLength(1);
 await page.getByRole('button',{name:'서버 초안 다시 불러오기'}).click();await expect(page.getByLabel('제목 *',{exact:true})).toHaveValue('응답 전에 저장된 내용');await expect(save(page)).toBeEnabled();await page.getByLabel('제목 *',{exact:true}).fill('복구 후 이어 쓴 내용');await save(page).click();await expect(page.getByText('서버에 초안을 저장했습니다. 학생 화면은 바뀌지 않았습니다.',{exact:true})).toBeVisible();expect(server.get().payload.form.basic.title).toBe('복구 후 이어 쓴 내용');expect(server.get().public.payload.form.basic.title).toBe('공개된 수업');
});
test('rejected publication retains acknowledged draft so correcting it does not cause a false conflict',async({page})=>{
 const server=await backend(page);await open(page);server.failPublish(400);await publish(page).click();await expect(page.getByText('파일 연결을 확인해 주세요.',{exact:true})).toBeVisible();await page.getByLabel('제목 *',{exact:true}).fill('수정 후 다시 반영');await publish(page).click();await expect(page.getByText('학생 화면에 반영했습니다. 공개 범위는 선택한 설정을 따릅니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.form.basic.title).toBe('수정 후 다시 반영');
});

test('after recovering the latest server draft, browser backup still restores later unsaved work',async({page})=>{
 const server=await backend(page);await open(page);server.failSave(503);await page.getByLabel('제목 *',{exact:true}).fill('서버에 남은 초안');await save(page).click();await expect(save(page)).toBeDisabled();await page.getByRole('button',{name:'서버 초안 다시 불러오기'}).click();await expect(save(page)).toBeEnabled();await page.getByRole('textbox',{name:'학생에게 표시할 태그'}).fill('복구 후 편집');await page.getByRole('button',{name:'지금 임시저장',exact:true}).click();await page.getByRole('button',{name:'편집 다시 열기'}).click();await page.getByRole('button',{name:'임시저장본 불러오기',exact:true}).click();await expect(page.getByRole('textbox',{name:'학생에게 표시할 태그'})).toHaveValue('복구 후 편집');expect(server.writes).toHaveLength(1);
});
test('new lesson keeps one stable identity after saving an unfinished server draft',async({page})=>{
 const server=await backend(page);await page.goto('/lesson-block-author-test?serverDraft=1&new=1');await page.getByRole('combobox',{name:'주차 (Week) *',exact:true}).selectOption(id(5));await save(page).click();await expect(page.getByText('서버에 초안을 저장했습니다. 학생 화면은 바뀌지 않았습니다.',{exact:true})).toBeVisible();expect(server.writes[0].create).toBe(true);const identity=server.writes[0].lessonId;await page.getByLabel('제목 *',{exact:true}).fill('새 초안 제목');await save(page).click();await expect(save(page)).toBeEnabled();expect(server.writes[1].lessonId).toBe(identity);expect(server.writes[1].create).toBe(false);expect(server.writes.filter(x=>x.action==='publish')).toHaveLength(0);
});

test('continuous document edits remain private in server drafts and retain question identities on publication',async({page})=>{
 await page.removeLocatorHandler(page.getByRole('button',{name:'항목별 상세 설정',exact:true}));
 const server=await backend(page);server.get().payload.blocks.document.blocks.push({id:'existing-question',type:'question',question:{label:'기존 질문',kind:'text',required:true}});server.get().public.payload=structuredClone(server.get().payload);
 await open(page);const document=page.getByRole('textbox',{name:'수업 문서',exact:true});await expect(document).toBeVisible();await document.locator('[data-author-block="original"] p').first().click();await page.keyboard.press('End');await page.keyboard.type(' 이어 쓴 내용');await save(page).click();await expect(save(page)).toBeEnabled();expect(server.get().payload.blocks.document.blocks[0].content).toContain('이어 쓴 내용');expect(server.get().public.payload.blocks.document.blocks[0].content).not.toContain('이어 쓴 내용');
 await page.getByRole('button',{name:'편집 다시 열기'}).click();await expect(document).toContainText('이어 쓴 내용');await publish(page).click();await expect(page.getByText('학생 화면에 반영했습니다. 공개 범위는 선택한 설정을 따릅니다.',{exact:true})).toBeVisible();expect(server.get().public.payload.blocks.document.blocks[1].id).toBe('existing-question');
});
