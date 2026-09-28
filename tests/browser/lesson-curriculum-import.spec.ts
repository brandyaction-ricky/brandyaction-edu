import {test,expect,type Page} from '@playwright/test';
const uid=(n:number)=>`aaaaaaaa-1111-4111-8111-${String(n).padStart(12,'0')}`;
const course='aaaaaaaa-1111-4111-8111-111111111111';
function payload(){return {requestId:uid(1),batch:{formatVersion:1,courseId:course,sourceDigest:'a'.repeat(64),sourceCapturedAt:'2026-09-07T05:18:25.000Z',weeks:[{id:uid(2),number:1,title:'시작하기',goal:'',existing:false}],lessons:['daily','learning'].map((track,i)=>({id:uid(i+10),revision:uid(i+20),sourceKey:track+':1',weekId:uid(2),order:i+1,title:track==='daily'?'오늘의 실습':'오늘의 학습',description:'',durationLabel:'10분',provenance:{sourceWeek:1,sourceDay:1,metadata:{},mapping:[],checklistMapping:[]},document:{schemaVersion:1,blocks:[{id:'t',type:'text',content:'시험용 원문'}],checklist:[],completion:{mode:track==='daily'?'mentor':'self',requireAnswers:false,requireQuizPass:track==='learning'},progression:{track,dayNumber:1}}})),media:[]}};}
async function choose(page:Page,data:unknown=payload()){await page.getByLabel('가져오기 JSON 파일').setInputFiles({name:'import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
async function backend(page:Page,options:{lost?:boolean;conflict?:boolean;badJson?:boolean;beforeWrite?:boolean}={}){
 const writes:Record<string,unknown>[]=[],reads:Record<string,unknown>[]=[];let applied=false;
 await page.route('**/api/admin/lesson-curriculum-import',async route=>{
  const body=route.request().postDataJSON();(body.action==='apply'?writes:reads).push(body);
  if(options.conflict){await route.fulfill({status:409,json:{error:'주차·학습 순서가 겹칩니다. 기존 수업은 바꾸지 않았습니다.'}});return;}
  if(body.action==='apply'&&options.beforeWrite&&writes.length===1){await route.fulfill({status:503,json:{error:'저장 전 연결 실패'}});return;}
  if(body.action==='apply')applied=true;
  if(body.action==='apply'&&writes.length===1&&(options.lost||options.badJson)){await route.fulfill(options.badJson?{status:200,body:'<html>broken</html>'}:{status:503,json:{error:'응답 확인 실패'}});return;}
  await route.fulfill({json:{requestId:body.requestId,applied,weeksCreated:1,lessonsCreated:2,daily:1,learning:1,lessons:[{sourceKey:'daily:1',lessonId:uid(10),revision:uid(20)},{sourceKey:'learning:1',lessonId:uid(11),revision:uid(21)}]}});
 });return{writes,reads};
}
test('author reviews original date, both tracks and server placement before importing unpublished lessons',async({page},info)=>{
 const server=await backend(page);await page.goto('/lesson-import-test');await choose(page);
 await expect(page.getByText(/원본 내보낸 시각/)).toContainText('2026. 9. 7.');await expect(page.getByText('데일리 미션 1개 · 별도 학습 1개')).toBeVisible();
 await page.getByText('가져올 주차·학습 목록 확인',{exact:true}).click();await expect(page.getByText('데일리 미션 1일차 · 오늘의 실습',{exact:true})).toBeVisible();await expect(page.getByText('별도 학습 1일차 · 오늘의 학습',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'비공개 수업으로 가져오기'})).toHaveCount(0);await page.getByRole('button',{name:'주차·파일 연결 확인'}).click();
 await expect(page.getByRole('button',{name:'비공개 수업으로 가져오기'})).toBeDisabled();await page.getByRole('checkbox',{name:'원본 날짜와 가져올 학습 목록을 확인했습니다.'}).check();await page.getByRole('button',{name:'비공개 수업으로 가져오기'}).dblclick();
 await expect(page.getByRole('status').filter({hasText:'비공개 학습 2개를 저장했습니다'})).toBeVisible();expect(server.writes).toHaveLength(1);expect(server.writes[0].batch).toEqual(payload().batch);await expect(page.getByText('목록 갱신 1회')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('import-private.png'),fullPage:true});
});
test('import preview distinguishes repeating practice from one-time day numbers',async({page})=>{
 await page.goto('/lesson-import-test');const data=payload();const ongoing={...data.batch.lessons[0],id:uid(30),revision:uid(31),sourceKey:'ongoing:1',order:3,title:'매주 반복',ongoing:'weekly',document:{schemaVersion:1,blocks:[{id:'t',type:'text',content:'반복 실습'}],checklist:[],completion:{mode:'self',requireAnswers:false,requireQuizPass:false}}};
 await choose(page,{...data,batch:{...data.batch,lessons:[...data.batch.lessons,ongoing]}});await expect(page.getByText(/데일리 미션 1개 · 별도 학습 1개 · 지속 챌린지 1개/)).toBeVisible();await page.getByText('가져올 주차·학습 목록 확인',{exact:true}).click();await expect(page.getByText('주간 지속 챌린지 · 매주 반복',{exact:true})).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
});
for(const badJson of [false,true])test(`lost import acknowledgment (${badJson?'malformed success':'server failure'}) preserves identity and recovers without a second write`,async({page})=>{
 const server=await backend(page,{lost:!badJson,badJson});await page.goto('/lesson-import-test');await choose(page);await page.getByRole('button',{name:'주차·파일 연결 확인'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'비공개 수업으로 가져오기'}).click();
 await expect(page.getByLabel('가져오기 JSON 파일')).toBeDisabled();await expect(page.getByRole('button',{name:'비공개 수업으로 가져오기'})).toBeDisabled();
 page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'다른 화면으로'}).click();await expect(page).toHaveURL(/lesson-import-test/);
 await page.getByRole('button',{name:'같은 파일로 저장 결과 확인'}).click();await expect(page.getByRole('status').filter({hasText:'비공개 학습 2개를 저장했습니다'})).toBeVisible();expect(server.writes).toHaveLength(1);expect(server.reads[1].requestId).toBe(server.writes[0].requestId);
 await page.reload();await choose(page);await page.getByRole('button',{name:'주차·파일 연결 확인'}).click();await expect(page.getByRole('status').filter({hasText:'비공개 학습 2개를 저장했습니다'})).toBeVisible();expect(server.writes).toHaveLength(1);
});
test('wrong product, malformed source and server conflicts never unlock import',async({page})=>{
 const server=await backend(page,{conflict:true});await page.goto('/lesson-import-test');const wrong=payload();wrong.batch.courseId=uid(999);await choose(page,wrong);await expect(page.getByRole('alert')).toContainText('다른 상품용');expect(server.reads).toHaveLength(0);
 await page.getByLabel('가져오기 JSON 파일').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});await expect(page.getByRole('alert')).toContainText('JSON 파일 형식');
 await choose(page);await page.getByRole('button',{name:'주차·파일 연결 확인'}).click();await expect(page.getByRole('alert')).toContainText('기존 수업은 바꾸지 않았습니다');await expect(page.getByRole('button',{name:'비공개 수업으로 가져오기'})).toHaveCount(0);expect(server.writes).toHaveLength(0);
});

test('a failed write can retry with the same identity after checking that it was not stored',async({page})=>{
 const server=await backend(page,{beforeWrite:true});await page.goto('/lesson-import-test');await choose(page);
 await page.getByRole('button',{name:'주차·파일 연결 확인'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'비공개 수업으로 가져오기'}).click();
 await expect(page.getByRole('button',{name:'비공개 수업으로 가져오기'})).toBeDisabled();await page.getByRole('button',{name:'같은 파일로 저장 결과 확인'}).click();
 await expect(page.getByRole('button',{name:'비공개 수업으로 가져오기'})).toBeEnabled();await page.getByRole('button',{name:'비공개 수업으로 가져오기'}).click();
 await expect(page.getByRole('status').filter({hasText:'비공개 학습 2개를 저장했습니다'})).toBeVisible();expect(server.writes).toHaveLength(2);expect(server.writes[1]).toEqual(server.writes[0]);await expect(page.getByText('목록 갱신 1회')).toBeVisible();
});
