import { test, expect, type Page } from '@playwright/test';
import { createCommunityDemo } from '../../features/campus/community/demo';
import { student } from '../campus-fixture/data';
const title='동료에게 보여줄 첫 제안';
async function compose(page:Page, sharing=false) {
 await page.getByRole('button',{name:'결과물 남기기',exact:true}).first().click();
 await page.getByLabel('제목',{exact:true}).fill(title);
 await page.getByRole('textbox',{name:'작업 내용',exact:true}).fill('지역 공방을 위한 첫 제안과 신청 흐름을 만들었습니다. 대상과 결과가 잘 전달되는지 확인해 주세요.');
 await page.getByLabel('작업물 URL').fill('https://example.com/work');
 if(sharing)await page.getByRole('radio',{name:'같은 기수와 공유'}).check();
 await page.getByRole('button',{name:sharing?'기수에 공유하며 저장':'나만 보도록 저장',exact:true}).click();
 await expect(page.getByRole('article',{name:'선택한 작업물'})).toBeVisible();
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}

test('private portfolio -> shared revision -> before/after history; mobile layout and no network mutation',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/campus/'))requests.push(r.url());});
 await page.goto('/community');await expect(page.getByText(/아래 동료와 기록은 가상/)).toBeVisible();
 await compose(page);await expect(page.getByText('나만 보는 기록입니다.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'개선한 새 버전 저장',exact:true}).click();
 await page.getByLabel('제목',{exact:true}).fill('공방의 첫 문의를 만드는 개선된 제안');
 await page.getByLabel('이번에 바꾼 점').fill('대상을 구체화하고 버튼에서 얻는 결과를 바꿨습니다.');
 await page.getByRole('radio',{name:'같은 기수와 공유'}).check();
 await page.getByRole('button',{name:'기수에 공유하며 저장',exact:true}).click();
 await page.getByRole('button',{name:'버전 2개 비교'}).click();
 await expect(page.getByLabel('수정 전')).toHaveValue('1');await expect(page.getByLabel('수정 후')).toHaveValue('2');
 await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 await noOverflow(page);expect(errors).toEqual([]);expect(requests).toEqual([]);
 await page.screenshot({path:test.info().outputPath('portfolio.png'),fullPage:true});
});

test('recipient verifies useful feedback and applies it only to a new portfolio revision',async({page})=>{
 await page.goto('/community');await compose(page,true);
 await page.getByRole('button',{name:'체험: 예시 동료 의견 추가'}).click();
 await page.getByRole('button',{name:'도움됨 · 반영 기록 남기기'}).click();
 await page.getByRole('checkbox',{name:'이 의견이 실제로 도움이 되었어요'}).check();
 await expect(page.getByRole('option',{name:'새 버전에 반영'})).toHaveJSProperty('disabled',true);
 await page.getByRole('button',{name:'확인 기록 저장'}).click();
 await expect(page.getByText('도움됨',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'개선한 새 버전 저장'}).click();
 await page.getByRole('textbox',{name:'작업 내용',exact:true}).fill('동료의 의견에 따라 지역 공방 운영자의 첫 고객 문의를 만드는 페이지로 바꿨습니다.');
 await page.getByLabel('이번에 바꾼 점').fill('첫 문장에 고객의 구체적인 상황을 넣었습니다.');
 await page.getByRole('button',{name:'기수에 공유하며 저장',exact:true}).click();
 await page.getByRole('button',{name:'확인 기록 수정'}).click();
 await page.getByRole('combobox',{name:'반영 상태',exact:true}).selectOption('apply');
 await page.getByRole('textbox',{name:'반영 내용 또는 유지한 이유',exact:true}).fill('첫 문장에 대상과 결과를 반영한 두 번째 버전입니다.');
 await page.getByRole('button',{name:'확인 기록 저장'}).click();
 await expect(page.getByText('v2에 반영했어요',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'나의 로켓 발사'})).toBeDisabled();
 await noOverflow(page);
});

test('peer feedback receipt grants no self XP, reporting is scoped and blocking is reversible',async({page})=>{
 await page.goto('/community');
 await page.getByRole('button',{name:/첫 화면만 보고 누구를 위한 서비스인지/}).click();
 await expect(page.getByRole('button',{name:'도움됨 · 반영 기록 남기기'})).toHaveCount(0);
 await page.getByLabel('동료에게 남길 의견').fill('첫 번째 버튼에서 고객이 받을 수 있는 결과를 더 구체적으로 알려주면 좋겠습니다.');
 await page.getByRole('button',{name:'의견 남기기',exact:true}).click();
 await page.getByRole('button',{name:'체험: 예시 동료가 도움됨 확인'}).click();
 await expect(page.getByText('도움됨',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'신고하기',exact:true}).click();
 await page.getByLabel('확인이 필요한 이유').fill('예시 신고입니다. 연결된 자료의 공개 범위를 확인해 주세요.');
 await page.getByRole('button',{name:'신고 접수',exact:true}).click();
 await page.getByRole('button',{name:'이 동료 차단',exact:true}).click();
 await expect(page.getByRole('button',{name:/첫 화면만 보고 누구를 위한 서비스인지/})).toHaveCount(0);
 await page.getByText('차단 관리 · 1명',{exact:true}).click();await page.getByRole('button',{name:'차단한 동료 1 해제',exact:true}).click();
 await expect(page.getByRole('button',{name:/첫 화면만 보고 누구를 위한 서비스인지/})).toBeVisible();
 await noOverflow(page);
});

test('unsafe links never enter portfolio and retained forms allow correction',async({page})=>{
 await page.goto('/community');await page.getByRole('button',{name:'결과물 남기기',exact:true}).first().click();
 await page.getByLabel('제목',{exact:true}).fill(title);await page.getByRole('textbox',{name:'작업 내용',exact:true}).fill('공개 가능한 링크만 안전하게 공유하는지 확인합니다.');await page.getByLabel('작업물 URL').fill('http://example.com');
 await page.getByRole('button',{name:'나만 보도록 저장'}).click();await expect(page.getByRole('alert')).toContainText('HTTPS');
 await page.getByLabel('작업물 URL').fill('https://example.com');await page.getByRole('button',{name:'나만 보도록 저장'}).click();
 await expect(page.getByRole('link',{name:'작업물 열기'})).toHaveAttribute('rel','noopener noreferrer');await noOverflow(page);
});

async function composeTyped(page:Page,kind:string,name:string){
 await page.getByRole('button',{name:'결과물 남기기',exact:true}).first().click();await page.getByRole('combobox',{name:'종류',exact:true}).selectOption(kind);
 await page.getByLabel('제목',{exact:true}).fill(name);await page.getByRole('textbox',{name:'작업 내용',exact:true}).fill('첫 화면의 제안과 고객 흐름을 함께 점검할 작업입니다. 구체적인 범위와 결과를 남겨요.');await page.getByRole('radio',{name:'같은 기수와 공유'}).check();await page.getByRole('button',{name:'기수에 공유하며 저장',exact:true}).click();
}
test('talent proposal needs recipient acceptance and recipient final confirmation with retained history',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/campus/'))requests.push(r.url());});await page.goto('/community');await composeTyped(page,'talent_offer','문구 검토 재능 교환');
 const flow=page.getByRole('region',{name:'재능 교환 진행'});await flow.getByRole('button',{name:'체험: 동료의 교환 제안 받기'}).click();await flow.getByRole('textbox',{name:'제안·작업 결과·처리 이유'}).fill('첫 화면 문구 세 개를 이번 주에 같이 검토하겠습니다.');await flow.getByRole('button',{name:'제안 수락',exact:true}).click();
 await flow.getByRole('textbox',{name:'제안·작업 결과·처리 이유'}).fill('세 가지 문구를 비교하고 고객 질문에 따라 두 번째 안으로 정리했습니다.');await flow.getByRole('button',{name:'체험: 동료가 완료 내용 제출'}).click();await flow.getByRole('textbox',{name:'제안·작업 결과·처리 이유'}).fill('합의한 문구 검토가 끝났고 결과를 받았습니다.');await flow.getByRole('button',{name:'결과 확인하고 완료'}).click();await expect(flow.getByText('서로 완료 확인 · 예시 동료',{exact:true})).toBeVisible();await expect(flow.getByText('변경 이력 · 4건')).toBeVisible();await noOverflow(page);expect(requests).toEqual([]);
});
test('demo day reserves a slot, accepts questions, presenter answers and operator finishes',async({page})=>{
 await page.goto('/community');await composeTyped(page,'demo_day','첫 고객 제안 발표');const flow=page.getByRole('region',{name:'데모데이 진행'});
 const tomorrow=new Date(Date.now()+86400000);const local=new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000).toISOString().slice(0,16);await flow.getByLabel('발표 시작 시간').fill(local);await flow.getByRole('button',{name:'발표 슬롯 예약'}).click();
 await flow.getByRole('textbox',{name:'질문·답변·진행 메모'}).fill('발표 환경을 확인했고 이제 발표를 시작합니다.');await flow.getByRole('button',{name:'체험: 진행자가 발표 시작'}).click();await flow.getByRole('textbox',{name:'질문·답변·진행 메모'}).fill('고객이 첫 화면에서 가장 궁금해한 것은 무엇인가요?');await flow.getByRole('button',{name:'발표에 질문 남기기'}).click();await flow.getByRole('textbox',{name:'질문·답변·진행 메모'}).fill('얼마나 빨리 첫 결과를 얻는지 궁금해했습니다.');await flow.getByRole('button',{name:'위 메모로 답변하기'}).click();await expect(flow.getByText(/문샷 동료 · 답변 완료/)).toBeVisible();await flow.getByRole('textbox',{name:'질문·답변·진행 메모'}).fill('발표와 질문 응답을 모두 마무리했습니다.');await flow.getByRole('button',{name:'체험: 진행자가 발표 종료'}).click();await expect(flow.getByText('발표 종료',{exact:true}).first()).toBeVisible();await noOverflow(page);await page.screenshot({path:test.info().outputPath('demo-day.png'),fullPage:true});
});
test('private real-file selection and drag/paste attach bytes locally, not to cohort or API',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/api/campus/'))requests.push(r.url());});await page.goto('/community');await compose(page,true);const files=page.getByRole('region',{name:'작업물 첨부'});
 await files.getByLabel('캡처·PDF 파일 첨부').setInputFiles({name:'내 기획.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nlocal demo file')});await expect(files.getByText(/내 기획.pdf/)).toBeVisible();
 const png=[137,80,78,71,13,10,26,10];await files.evaluate((node,png)=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(png)],'붙여넣은 캡처.png',{type:'image/png'}));node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},png);await expect(files.getByText(/붙여넣은 캡처.png/)).toBeVisible();
 await files.evaluate((node,png)=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(png)],'드롭 캡처.png',{type:'image/png'}));node.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));},png);await expect(files.getByText(/드롭 캡처.png/)).toBeVisible();await expect(files.getByRole('link',{name:'내 파일 다운로드'})).toHaveCount(3);await expect(files.getByText(/처음에는 나만/)).toBeVisible();expect(requests).toEqual([]);await noOverflow(page);
});
test('file sharing is a separate unchecked choice and private post changes revoke it',async({page})=>{
 await page.goto('/community');await compose(page,true);const files=page.getByRole('region',{name:'작업물 첨부'});await files.getByLabel('캡처·PDF 파일 첨부').setInputFiles({name:'공개할 캡처.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nsample')});
 const check=files.getByRole('checkbox',{name:'이 파일을 같은 기수에 공개합니다'});await expect(check).not.toBeChecked();await expect(files.getByRole('button',{name:'확인한 파일 기수에 공유'})).toBeDisabled();await check.check();await files.getByRole('button',{name:'확인한 파일 기수에 공유'}).click();await expect(files.getByText(/공개할 캡처.pdf.*기수 공개/)).toBeVisible();
 await page.getByRole('button',{name:'개선한 새 버전 저장'}).click();await page.getByLabel('이번에 바꾼 점').fill('내 작업을 비공개로 바꾸면서 첨부 공개를 회수합니다.');await page.getByRole('radio',{name:'나만 보기'}).check();await page.getByRole('button',{name:'나만 보도록 저장'}).click();await expect(files.getByText(/공개할 캡처.pdf.*나만 보기/)).toBeVisible();await expect(files.getByRole('button',{name:'확인한 파일 기수에 공유'})).toBeDisabled();
});
test('empty and saved community forms do not lock navigation, while an actual draft does',async({page})=>{
 await page.goto('/community');const guarded=()=>page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
 await page.getByRole('button',{name:'결과물 남기기',exact:true}).first().click();await expect.poll(guarded).toBe(false);await page.getByLabel('제목',{exact:true}).fill('작성 보호 검수');await expect.poll(guarded).toBe(true);
 await page.getByRole('textbox',{name:'작업 내용',exact:true}).fill('새 결과물을 작성한 뒤 저장하면 작성 보호를 해제하는지 확인합니다.');await page.getByRole('button',{name:'나만 보도록 저장'}).click();await expect.poll(guarded).toBe(false);await page.getByRole('button',{name:'개선한 새 버전 저장'}).click();await expect.poll(guarded).toBe(false);
});

test('late workspace response cannot replace the latest selected portfolio view',async({page})=>{
 const oldState={...createCommunityDemo(student),demo:false};
 const mine={...oldState.posts[0],id:'00000000-0000-4000-8000-000000009901',owner_id:student.viewer.id,enrollment_id:student.selectedEnrollmentId!,kind:'portfolio' as const,visibility:'private' as const,title:'최신 선택한 나만의 작업'};
 const latestState={...oldState,posts:[mine],revisions:[]};
 let firstRequested=false,releaseFirst!:()=>void;
 const firstPending=new Promise<void>(resolve=>{releaseFirst=resolve;});
 await page.route('**/api/campus/community?**',async route=>{
  const view=new URL(route.request().url()).searchParams.get('view');
  if(view==='all'){firstRequested=true;await firstPending;await route.fulfill({json:oldState});}
  else await route.fulfill({json:latestState});
 });
 await page.goto('/community-live');await expect.poll(()=>firstRequested).toBe(true);
 await page.getByRole('button',{name:'내 포트폴리오',exact:true}).click();
 await expect(page.getByRole('heading',{name:mine.title,exact:true})).toBeVisible();
 const lateResponse=page.waitForResponse(r=>r.url().includes('/api/campus/community?')&&new URL(r.url()).searchParams.get('view')==='all');
 releaseFirst();await lateResponse;await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(page.getByRole('heading',{name:mine.title,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'내 포트폴리오',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText('작업실을 불러오고 있어요…',{exact:true})).toHaveCount(0);await noOverflow(page);
});
