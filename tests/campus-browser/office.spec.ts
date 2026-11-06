import { test, expect, type Page } from '@playwright/test';
import { student } from '../campus-fixture/data';
const objective='지역 공방을 위한 첫 제안 페이지의 고객 대상과 행동 버튼을 점검해 주세요.';
async function create(page:Page){await page.getByRole('textbox',{name:'이루고 싶은 목표',exact:true}).fill(objective);await page.getByRole('button',{name:'요청 보관하기',exact:true}).click();await expect(page.getByRole('article',{name:'선택한 AI 직원 작업'})).toBeVisible();}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
test('incoming job reports update without manual refresh; network loss is visible and recovery keeps the result', async ({ page }) => {
 const job = { id: '00000000-0000-4000-8000-000000000123', owner_id: student.viewer.id, enrollment_id: student.selectedEnrollmentId,
   objective: '개발 검수용 보고 상태 확인 작업입니다.', material_urls: [], output_type: 'analysis', status: 'queued', revision: 2,
   draft_text: '', draft_url: '', review_note: '', error_note: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
 let unavailable = false;
 await page.route('**/api/campus/office?*', route => route.fulfill({ status: unavailable ? 503 : 200, contentType: 'application/json', body: JSON.stringify(unavailable ? { error: 'Unavailable' } : { jobs: [job], history: [], connection: 'incoming_adapter_registered', demo: false }) }));
 await page.goto('/office?api=1');
 await page.getByRole('button', { name: /개발 검수용 보고 상태 확인 작업/ }).click();
 const detail = page.getByRole('article', { name: '선택한 AI 직원 작업' });
 await expect(detail.getByText('요청 접수', { exact: true })).toBeVisible();
 job.status = 'running'; job.revision = 3;
 await expect(detail.getByText('실행 중', { exact: true })).toBeVisible({ timeout: 8000 });
 job.status = 'review'; job.revision = 4; job.draft_text = '로컬 HTTP 시험에서 수신한 분석 결과입니다. 실제 AI 업무 결과는 아닙니다.';
 await expect(detail.getByText(job.draft_text, { exact: true })).toBeVisible({ timeout: 8000 });
 unavailable = true;
 await expect(page.getByText(/작업 소식을 갱신하지 못했어요/)).toBeVisible({ timeout: 8000 });
 await expect(detail.getByText(job.draft_text, { exact: true })).toBeVisible();
 unavailable = false;
 await expect(page.getByText(/작업 소식을 갱신하지 못했어요/)).toHaveCount(0, { timeout: 8000 });
 await page.reload();
 await page.getByRole('button', { name: /개발 검수용 보고 상태 확인 작업/ }).click();
 await expect(page.getByText(job.draft_text, { exact: true })).toBeVisible();
 await noOverflow(page);
});
test('disconnected office stores private request; only explicit synthetic receipts reach review, human approval and archive',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/campus/office'))requests.push(r.url());});
 await page.goto('/office');expect((await page.getByRole('heading',{name:/부탁할 일을 정리하고/}).boundingBox())!.width).toBeGreaterThan(190);await expect(page.getByText('AI 직원 연결 준비 중',{exact:true})).toBeVisible();await create(page);
 const detail=page.getByRole('article',{name:'선택한 AI 직원 작업'});
 await expect(detail.getByText('연결 대기',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'검토 후 승인',exact:true})).toHaveCount(0);
 await detail.getByText('로컬 검수용 예시 이벤트',{exact:true}).click();
 await expect(page.getByRole('button',{name:'예시 초안 도착'})).toBeDisabled();
 await page.getByRole('button',{name:'예시 접수',exact:true}).click();await expect(detail.getByText('요청 접수',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'예시 실행 시작',exact:true}).click();await expect(detail.getByText('실행 중',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'이 작업 보관',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'예시 초안 도착',exact:true}).click();await expect(detail.getByText('내 검토 필요',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'검토 후 승인',exact:true})).toBeDisabled();
 await page.getByRole('textbox',{name:'검토 메모',exact:true}).fill('고객 대상과 실행 순서를 확인했고 이 초안으로 진행하겠습니다.');await page.getByRole('button',{name:'검토 후 승인',exact:true}).click();
 await expect(detail.getByText('승인 완료',{exact:true})).toBeVisible();await detail.getByText('요청·검토 이력',{exact:true}).click();await expect(detail.getByText('v1 · 연결 대기',{exact:true})).toBeVisible();await noOverflow(page);
 await page.screenshot({path:test.info().outputPath('office-approved.png'),fullPage:true});
 await page.getByRole('button',{name:'이 작업 보관',exact:true}).click();await expect(detail.getByText('보관됨',{exact:true})).toBeVisible();await page.getByRole('button',{name:'보관함 보기',exact:true}).click();await expect(page.getByRole('button',{name:new RegExp(objective)})).toBeVisible();
 expect(errors).toEqual([]);expect(requests).toEqual([]);
});
test('revision request requires another received draft and failed job retries to waiting without dispatch',async({page})=>{
 await page.goto('/office');await create(page);const detail=page.getByRole('article',{name:'선택한 AI 직원 작업'});
 await detail.getByText('로컬 검수용 예시 이벤트',{exact:true}).click();await page.getByRole('button',{name:'예시 접수',exact:true}).click();await page.getByRole('button',{name:'예시 실행 시작',exact:true}).click();await page.getByRole('button',{name:'예시 초안 도착',exact:true}).click();
 await page.getByRole('textbox',{name:'검토 메모',exact:true}).fill('고객 대상을 동네 공방 운영자로 더 구체화해 주세요.');await page.getByRole('button',{name:'수정 요청',exact:true}).click();await expect(detail.getByText('수정 요청',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'검토 후 승인'})).toHaveCount(0);
 await page.getByRole('button',{name:'예시 접수',exact:true}).click();await page.getByRole('button',{name:'예시 실행 오류',exact:true}).click();await expect(detail.getByText('실행 오류',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'다시 연결 대기로',exact:true}).click();await expect(detail.getByText('연결 대기',{exact:true})).toBeVisible();await noOverflow(page);
});
