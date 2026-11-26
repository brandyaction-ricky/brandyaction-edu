import {test,expect} from '@playwright/test';
test.setTimeout(120000);
test('legacy welcome bookmark opens the study room and offers no retired destination',async({page})=>{
 await page.goto('/welcome-preview');
 await expect(page.getByRole('banner').getByText('문샷 공부방',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'공간 이동',exact:true}).click();
 await expect(page.getByRole('button',{name:'문샷 자료실 입장',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'문샷 개강 준비실 입장',exact:true})).toHaveCount(0);
});
test('admin edits welcome texts, replay and notices and sees them after reload',async({page})=>{
 await page.goto('/library-admin-preview');await page.getByRole('button',{name:'새 행사 만들기'}).click();await page.getByLabel('행사 주소',{exact:false}).fill('welcome-qa');await page.getByLabel('연결할 교육 기수').selectOption({index:1});await page.getByRole('navigation',{name:'관리 항목'}).getByRole('button',{name:'수강생 시작 안내',exact:true}).click();await page.getByRole('button',{name:'환영·다시보기',exact:true}).click();await page.getByLabel('웰컴 제목',{exact:true}).fill('우리 기수의 첫걸음');await page.getByLabel('대표 유튜브 영상 주소').fill('https://youtu.be/abcdefghijk');await page.getByRole('navigation',{name:'웰컴 콘텐츠 선택'}).getByRole('button',{name:'공지사항',exact:true}).click();await page.getByRole('button',{name:'+ 공지 추가',exact:true}).click();const notice=page.locator('details[open]').filter({has:page.getByLabel('공지 제목',{exact:true})});await notice.getByLabel('공지 제목',{exact:true}).fill('우리 기수 준비물');await notice.getByRole('textbox',{name:'내용',exact:true}).fill('노트북을 준비해 주세요.');await notice.getByLabel('웰컴 존에 표시').check();await notice.getByLabel('중요 공지').check();await page.getByRole('button',{name:'설정 저장',exact:true}).click();await expect(page.getByText('이 브라우저에 예시 설정을 저장했어요.',{exact:false})).toBeVisible();await expect(page.getByRole('link',{name:'관리자 전용 공간 미리보기 ↗',exact:true})).toHaveAttribute('href','/admin/campus/preview?slug=welcome-qa');await page.reload();await page.getByRole('button',{name:/작성 중 문샷 오픈 캠퍼스 welcome-qa/}).click();await page.getByRole('navigation',{name:'관리 항목'}).getByRole('button',{name:'수강생 시작 안내',exact:true}).click();await page.getByRole('button',{name:'환영·다시보기',exact:true}).click();await expect(page.getByLabel('웰컴 제목',{exact:true})).toHaveValue('우리 기수의 첫걸음');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('event list keeps the full address in its row and allows cancelling or confirming removal',async({page})=>{
 await page.goto('/library-admin-preview');
 const list=page.getByRole('complementary',{name:'행사 선택'});
 await page.getByRole('button',{name:'새 행사 만들기'}).click();
 const address=page.getByLabel('행사 주소');
 await expect(address).toHaveValue(/^campus-[0-9]{8}-[a-f0-9]{8}$/);
 const slug='event-list-'+('long-'.repeat(8))+'qa';
 await address.fill(slug);
 await page.getByLabel('제목',{exact:true}).fill('긴 제목과 주소가 함께 표시되는 행사');
 await page.getByLabel('연결할 교육 기수').selectOption({index:1});
 await page.getByRole('button',{name:'설정 저장'}).click();
 const row=list.getByRole('listitem').filter({hasText:slug});
 await expect(row).toBeVisible();
 const contained=await row.evaluate(li=>{
   const box=li.getBoundingClientRect(),text=li.querySelector('small')!.getBoundingClientRect();
   return text.bottom<=box.bottom&&text.right<=box.right;
 });
 expect(contained).toBe(true);
 const remove=row.getByRole('button',{name:/삭제/});
 page.once('dialog',dialog=>dialog.dismiss());await remove.click();await expect(row).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await remove.click();await expect(row).toHaveCount(0);
 await page.reload();await expect(list.getByText('등록된 행사가 없습니다.')).toBeVisible();
});
