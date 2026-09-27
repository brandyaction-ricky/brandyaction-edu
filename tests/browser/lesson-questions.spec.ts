import { expect, test } from '@playwright/test';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
test('student asks privately inside the actual classroom, retries without duplication and reads the answer',async({page})=>{
 const bodies:Record<string,unknown>[]=[];let saved=false;
 await page.route('**/api/platform/lesson-questions?**',r=>r.fulfill({json:{questions:saved?[{id:id(9),title:'실습 질문',content:'이 단계가 궁금해요',answer:'이 순서로 진행해 주세요.',status:'answered'}]:[],hasMore:false}}));
 await page.route('**/api/platform/lesson-questions',r=>{bodies.push(r.request().postDataJSON());saved=bodies.length>1;return r.fulfill(saved?{json:{question:{id:id(9)}}}:{status:503,json:{error:'응답 확인 실패'}});});
 await page.goto('/classroom-questions-test');
 await expect(page.getByText('학습하면서 바로 질문합니다.')).toBeVisible();
 await page.getByRole('link',{name:'이 수업에 개인 질문 남기기'}).click();
 await page.getByRole('button',{name:'이 학습에 질문하기',exact:true}).click();
 await page.getByRole('textbox',{name:'질문 제목',exact:true}).fill('실습 질문');
 await page.getByRole('textbox',{name:'질문 내용',exact:true}).fill('이 단계가 궁금해요');
 await page.getByRole('button',{name:'질문 등록',exact:true}).click();await expect(page.getByRole('alert')).toContainText('응답 확인 실패');
 await expect(page.getByRole('textbox',{name:'질문 내용',exact:true})).toHaveValue('이 단계가 궁금해요');
 await page.getByRole('button',{name:'등록 결과 다시 확인'}).click();
 expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);expect(bodies[0]).toMatchObject({enrollmentId:id(1),lessonId:id(4),title:'실습 질문'});
 await expect(page.getByText('이 순서로 진행해 주세요.')).toBeVisible();await expect(page).toHaveURL(/classroom-questions-test/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('question list errors are recoverable and navigation protects an unfinished question',async({page})=>{
 let reads=0;await page.route('**/api/platform/lesson-questions?**',r=>r.fulfill(++reads===1?{status:503,json:{error:'목록 연결 실패'}}:{json:{questions:[],hasMore:false}}));
 await page.goto('/classroom-questions-test');await expect(page.getByRole('alert')).toContainText('목록 연결 실패');
 await page.getByRole('button',{name:'질문 다시 불러오기'}).click();await expect(page.getByText('이 학습에 남긴 질문이 없습니다.')).toBeVisible();
 await page.getByRole('button',{name:'이 학습에 질문하기',exact:true}).click();await page.getByRole('textbox',{name:'질문 내용',exact:true}).fill('작성 중 질문');
 page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'내 질문 전체 보기'}).click();await expect(page).toHaveURL(/classroom-questions-test/);await expect(page.getByRole('textbox',{name:'질문 내용',exact:true})).toHaveValue('작성 중 질문');
});
