import { expect, test } from '@playwright/test';
import { type LearningReminderChoice } from '../../lib/learning-reminders';

const user = { id:'synthetic-member', full_name:'합성 수강생', email:'student@example.test', phone:null, role:'student' };

test('student can request and cancel each reminder separately while delivery is off', async ({ page }) => {
  const choices: LearningReminderChoice[] = [
    { kind:'member_inactive', eligible:true, request:null },
    { kind:'learning_stalled', eligible:true, request:null },
  ];
  const operations: string[] = [];
  await page.route('**/api/platform**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path !== '/api/platform/learning-reminders') {
      await route.fulfill({ json:path === '/api/platform/member-visit' ? { ok:true } : { user, data:{}, support:{} } });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      operations.push(body.action);
      if (body.action === 'request') {
        const choice = choices.find(item => item.kind === body.kind)!;
        choice.request = { id:body.requestId, days:body.days, status:'pending',
          requestedAt:'2026-11-18T12:00:00Z', dueAt:'2026-11-22T12:00:00Z' };
      } else {
        const request = choices.find(item => item.request?.id === body.requestId)!.request!;
        request.status = 'cancelled';
      }
    }
    await route.fulfill({ json:{ maskedPhone:'010-****-1234', courses:[{ enrollmentId:'enrollment-qa', courseTitle:'QA 과정', cohortName:'QA 기수', choices }] } });
  });
  await page.goto('/public-data-test?publicScreen=my/profile#learning-reminders');
  const settings = page.getByRole('region', { name:'카카오톡 학습 알림' });
  await expect(settings).toContainText('카카오톡은 발송되지 않아요');
  await expect(settings).toContainText('010-****-1234');
  await expect(settings.getByLabel('방문 알림 확인 기간(일)')).toHaveValue('3');
  await settings.getByLabel('방문 알림 확인 기간(일)').fill('4');
  await settings.getByRole('button', { name:'방문 알림 1회 신청' }).click();
  await expect(settings.getByRole('status')).toHaveText('1회 신청을 저장했어요.');
  await expect(settings).toContainText('신청됨 · 4일');
  await settings.getByRole('button', { name:'진도 알림 1회 신청' }).click();
  await expect(settings.getByRole('button', { name:'진도 알림 신청 취소' })).toBeVisible();
  await page.reload();
  await settings.getByRole('button', { name:'방문 알림 신청 취소' }).click();
  await expect(settings.getByRole('status')).toHaveText('신청을 취소했어요.');
  await expect(settings).toContainText('취소됨 · 4일');
  await expect(settings.getByRole('button', { name:'진도 알림 신청 취소' })).toBeVisible();
  expect(operations).toEqual(['request','request','cancel']);
  expect(await settings.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
