import { expect, test } from '@playwright/test';

test('nonmodal consultation retains draft and answers while handing off without forwarding conversation',async({page})=>{
  await page.goto('/home-consultation-test');
  await page.getByRole('button',{name:'에듀에 물어보세요'}).click();
  const panel=page.getByRole('region',{name:'에듀 이용 상담'});
  const input=panel.getByRole('textbox',{name:'궁금한 점'});
  await expect(input).toBeFocused();
  await input.fill('수업을 언제 볼 수 있나요?');
  await input.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button',{name:'에듀에 물어보세요'})).toBeFocused();
  await page.getByRole('button',{name:'에듀에 물어보세요'}).click();
  await expect(input).toHaveValue('수업을 언제 볼 수 있나요?');
  await panel.getByRole('button',{name:'질문 보내기'}).click();
  await expect(panel.getByText('AI 안내',{exact:true})).toBeVisible();
  await expect(panel.getByRole('link',{name:'클래스 안내 ↗'})).toHaveAttribute('href','https://brandyaction-edu.com/classes');
  await page.getByRole('button',{name:'상담창 닫기'}).click();
  await page.getByRole('button',{name:'에듀에 물어보세요'}).click();
  await expect(panel.getByText('수업을 언제 볼 수 있나요?',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'담당자 상담'}).click();
  await expect(panel.getByText('대화는 자동으로 전달되지 않아요. 필요한 내용만 직접 보내주세요.')).toBeVisible();
  const handoff=panel.getByRole('link',{name:'카카오 상담 열기 ↗'});
  await expect(handoff).toHaveAttribute('href','https://pf.kakao.com/example/chat');
  await expect(handoff).toHaveAttribute('rel','noopener noreferrer');
  await expect(page.getByRole('link',{name:'클래스 둘러보기'})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('home-consultation.png')});
});

test('unresolved answer and responder failure offer staff support without inventing guidance or losing draft',async({page})=>{
  await page.goto('/home-consultation-test');
  await page.getByRole('button',{name:'에듀에 물어보세요'}).click();
  const panel=page.getByRole('region',{name:'에듀 이용 상담'});
  const input=panel.getByRole('textbox',{name:'궁금한 점'});
  await input.fill('자료에서 모르는 내용');
  await panel.getByRole('button',{name:'질문 보내기'}).click();
  await expect(panel.getByRole('link',{name:'카카오 상담 열기 ↗'})).toBeVisible();
  await expect(panel.getByRole('list',{name:'안내 근거'})).toHaveCount(0);
  await input.fill('오류 검수');
  await panel.getByRole('button',{name:'질문 보내기'}).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('오류 검수');
});
