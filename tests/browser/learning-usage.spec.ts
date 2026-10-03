import { expect, test, type Page } from '@playwright/test';
const member='11111111-1111-4111-8111-111111111111';
async function backend(page:Page,failed=false){
 await page.route('**/api/admin/member-overview**',r=>r.fulfill({json:{rows:[],total:0,page:1,pageSize:20}}));
 await page.route('**/api/admin/learning-progress**',r=>r.fulfill({json:{rows:[],total:0,page:1,pageSize:20}}));
 await page.route('**/api/admin/learning-usage**',r=>failed?r.fulfill({status:503,json:{error:'이용 기록을 불러오지 못했습니다.'}}):r.fulfill({json:{total:1,page:1,pageSize:10,rows:[{enrollmentId:member,courseTitle:'AI 문샷 챌린지 · 검수용 가상 데이터',cohortName:'4기',enrollmentStatus:'active',compositionBasis:'current_registered_not_contract_snapshot',items:[
  {type:'vod_complete',id:'vod',title:'Day 1 · AI 마케팅 시작',available:true,firstUsedAt:'2026-10-05T10:00:00Z',lastUsedAt:'2026-10-05T10:00:00Z',requests:1,source:'lesson_progress'},
  {type:'material_download',id:'file',title:'실행 자료집',available:true,firstUsedAt:'2026-10-05T11:00:00Z',lastUsedAt:'2026-10-05T12:00:00Z',requests:7,source:'signed_file_issued'},
  {type:'live_join',id:'live',title:'1회 라이브',available:true,firstUsedAt:null,lastUsedAt:null,requests:null,source:null},
  {type:'replay_view',id:'replay',title:'1회 다시보기',available:false,firstUsedAt:null,lastUsedAt:null,requests:null,source:null},
 ],historicalItems:[{type:'material_download',id:'old',firstUsedAt:'2026-10-01T10:00:00Z',lastUsedAt:'2026-10-01T10:00:00Z',requests:1,source:'legacy_record'}]}]}}));
 return()=>{failed=false;};
}
test('member usage gives unique item reference ratio and dated evidence with clear limitations',async({page},info)=>{
 await backend(page);await page.goto('/admin-learning-progress-test?member');const panel=page.getByRole('region',{name:'수강 이용 기록',exact:true});
 await expect(panel).toContainText('참고 이용률 50%');await expect(panel).toContainText('2 / 4개 이용');await expect(panel).toContainText('환불을 자동 판정하지 않습니다');
 for(const label of ['VOD 학습 완료','자료 제공','라이브 입장','다시보기 열람'])await expect(panel.getByText(label,{exact:true})).toBeVisible();
 await panel.getByText('항목별 근거 4개 확인',{exact:true}).click();await expect(panel).toContainText('요청 7회 (이용률에는 1개로 계산)');await expect(panel).toContainText('실제 시청 시간은 확인하지 않습니다');await expect(panel).toContainText('아직 공개되지 않음');
 await panel.getByText('현재 구성에서 빠진 과거 기록 1개',{exact:true}).click();await expect(panel).toContainText('위 참고 이용률에서는 제외했습니다');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
 await page.screenshot({path:info.outputPath('learning-usage.png'),fullPage:true});
});
test('failed evidence loads do not show a fabricated zero and can be retried',async({page})=>{
 const recover=await backend(page,true);await page.goto('/admin-learning-progress-test?member');const panel=page.getByRole('region',{name:'수강 이용 기록',exact:true});await expect(panel.getByRole('alert')).toContainText('이용 기록을 불러오지 못했습니다');await expect(panel.getByText('참고 이용률 0%')).toHaveCount(0);
 recover();await panel.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(panel).toContainText('참고 이용률 50%');
});
