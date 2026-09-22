import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Local responses only: no external enrollment, image or policy requests.
  await page.route('https://example.test/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
});

for (const mode of ['inline', 'iframe']) {
  for (const state of ['upcoming', 'recruiting', 'closed', 'cancelled', 'operation-ended']) {
    test(`BF04 ${mode} ${state}: marker, content and entitlement matrix after save sanitization`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      const sandboxDiagnostics: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() !== 'error') return;
        // Playwright's injected iframe helpers trigger this exact browser refusal.
        // Preserve the diagnostic as evidence; never weaken the production sandbox.
        if (mode === 'iframe' && message.text() === "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.") sandboxDiagnostics.push(message.text());
        else errors.push(message.text());
      });
      for (const member of ['guest', 'member', 'active', 'expired', 'revoked']) {
        for (const settings of ['', '&custom', '&landing', '&custom&landing']) {
          await page.goto(`/learning-qa?bf04&state=${state}&member=${member}${mode === 'inline' ? '&inline' : ''}${settings}`);
          if (mode === 'iframe') {
            await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-same-origin');
            expect(await page.locator('iframe').getAttribute('srcdoc')).not.toMatch(/<script\b/i);
          }
          const scope = mode === 'inline' ? page : page.frameLocator('iframe');
          const accessible = member === 'active', open = state === 'recruiting';
          const href = accessible ? '/learn/enrollment' : settings ? 'https://example.test/join' : '/apply?cohort=cohort';
          for (const id of ['marked-cta', 'image-cta', 'icon-cta', 'legacy-cta']) {
            const cta = scope.locator(`#${id}`);
            if (accessible || open) {
              await expect(cta).toHaveAttribute('href', href);
              await expect(cta).not.toHaveAttribute('aria-disabled', 'true');
            } else {
              await expect(cta).not.toHaveAttribute('href');
              await expect(cta).toHaveAttribute('aria-disabled', 'true');
              await expect(cta).toHaveAttribute('tabindex', '-1');
            }
          }
          await expect(scope.locator('#marked-cta > span > strong')).toHaveCount(1);
          await expect(scope.locator('#image-cta img')).toHaveCount(1);
          await expect(scope.locator('#icon-cta span')).toHaveText('★');
          await expect(scope.locator('#refund-policy')).toHaveAttribute('href', '/policies/refund');
          await expect(scope.locator('#refund-policy')).toHaveText('환불 신청 안내');
          await expect(scope.locator('#guide')).toHaveText('무료강의 참여 안내');
          await expect(scope.locator('#guide')).toHaveAttribute('href', 'https://example.test/guide');
          await expect(scope.locator('#toc')).toHaveAttribute('href', '#outline');
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        }
      }
      if (sandboxDiagnostics.length) await testInfo.attach('sandbox-refusals-not-application-errors', { body: JSON.stringify({ count: sandboxDiagnostics.length, message: sandboxDiagnostics[0] }), contentType: 'application/json' });
      expect(errors).toEqual([]);
    });
  }

  test(`BF04 ${mode}: disabled mouse, Enter, Tab and editorial clicks never convert`, async ({ page }, testInfo) => {
    await page.goto(`/learning-qa?bf04&state=closed${mode === 'inline' ? '&inline' : ''}`);
    const scope = mode === 'inline' ? page : page.frameLocator('iframe');
    for (const id of ['marked-cta', 'image-cta', 'icon-cta']) {
      const cta = scope.locator(`#${id}`);
      await cta.click({ force: true });
      await cta.press('Enter');
      await expect(page).toHaveURL(/learning-qa/);
    }
    await scope.locator('#marked-cta').press('Tab');
    await expect(scope.locator('#refund-policy')).toBeFocused();
    await scope.locator('#toc').click();
    await expect(scope.locator('#outline')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-conversions');
    await page.screenshot({ path: testInfo.outputPath(`${mode}-closed.png`), fullPage: true });

    for (const state of ['closed', 'recruiting']) {
      await page.goto(`/learning-qa?bf04&state=${state}${mode === 'inline' ? '&inline' : ''}`);
      await expect(scope.locator('#refund-policy')).toHaveText('환불 신청 안내');
      // Observe conversion dispatch directly; suppress navigation only after the real click handler.
      const source = mode === 'inline' ? page : page.frames().find(frame => frame.url() === 'about:srcdoc')!;
      await source.evaluate(() => {
        window.open = () => null;
        document.querySelector('#refund-policy')!.addEventListener('click', event => event.preventDefault());
      });
      await page.route('**/policies/refund', route => route.abort());
      const conversions: string[] = [];
      await page.exposeFunction(`recordBf04${state}`, () => conversions.push('conversion'));
      await page.evaluate(name => window.addEventListener('edu:product-cta', () => (window as unknown as Record<string, () => void>)[name]()), `recordBf04${state}`);
      await scope.locator('#refund-policy').click();
      expect(conversions).toEqual([]);
    }
  });

  test(`BF04 ${mode}: marked digital CTAs retain library access without conversion`, async ({ page }) => {
    await page.goto(`/learning-qa?bf04&category=digital&state=closed&member=active&custom&landing${mode === 'inline' ? '&inline' : ''}`);
    const scope = mode === 'inline' ? page : page.frameLocator('iframe');
    for (const id of ['marked-cta', 'image-cta', 'icon-cta', 'legacy-cta']) {
      await expect(scope.locator(`#${id}`)).toHaveAttribute('href', '/my/resources');
      await expect(scope.locator(`#${id}`)).not.toHaveAttribute('data-product-cta');
      await expect(scope.locator(`#${id}`)).not.toHaveAttribute('data-landing-cta');
    }
    const conversions: string[] = [];
    await page.exposeFunction('recordAccessConversion', () => conversions.push('conversion'));
    await page.evaluate(() => window.addEventListener('edu:product-cta', () => (window as unknown as { recordAccessConversion: () => void }).recordAccessConversion()));
    await page.route('**/my/resources', route => route.abort());
    await scope.locator('#marked-cta').click();
    expect(conversions).toEqual([]);
  });
}
