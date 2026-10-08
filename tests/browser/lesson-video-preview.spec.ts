import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Synthetic, two-second red H.264 video; generated locally with ffmpeg's color source.
const videoBytes = readFileSync('tests/browser/fixture/media/video-preview.mp4');
const asset = 'aaaaaaaa-1111-4111-8111-111111111111';
const revision = 'bbbbbbbb-1111-4111-8111-111111111111';
const document = { schemaVersion: 1, blocks: [{ id: 'video', type: 'video', assetId: asset }], checklist: [] };

for (const audience of ['admin', 'student'] as const) {
  test(`${audience}: opening frame and duration appear without play; retry keeps authorization context`, async ({ page }) => {
    const mediaRequests: URL[] = [];
    let fail = true;
    await page.route('**/api/platform/lesson-blocks**', async route => {
      if (new URL(route.request().url()).searchParams.get('action') === 'progression') {
        await route.fulfill({ json: { lessons: [{ lessonId: 'aaaaaaab-1111-4111-8111-000000000004', isUnlocked: true, track: null }] } }); return;
      }
      await route.fulfill({ json: { document, revision, currentRevision: revision, editable: audience === 'admin', draft: null, previousDrafts: [] } });
    });
    await page.route('**/api/platform/lesson-media**', async route => {
      mediaRequests.push(new URL(route.request().url()));
      if (fail) { await route.fulfill({ status: 503 }); return; }
      const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
      const start = Number(range?.[1] || 0), end = Math.min(Number(range?.[2] || videoBytes.length - 1), videoBytes.length - 1);
      await route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4', headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${videoBytes.length}` } : {}) }, body: videoBytes.subarray(start, end + 1) });
    });
    await page.goto(audience === 'admin' ? '/lesson-block-author-test' : '/lesson-blocks-test');
    const video = page.locator('video');
    await expect(page.getByRole('alert').filter({ hasText: '자료를 열지 못했습니다' })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: '자료 다시 열기', exact: true }).click();
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => ({ ready: v.readyState >= 2, paused: v.paused, duration: v.duration, width: v.videoWidth }))).toEqual({ ready: true, paused: true, duration: 2, width: 320 });
    // Decode and inspect the actual first frame, not just the preload attribute.
    const pixel = await video.evaluate((v: HTMLVideoElement) => {
      const canvas = window.document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(v, 0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    });
    expect(pixel[0]).toBeGreaterThan(150); expect(pixel[1]).toBeLessThan(70);
    const successful = mediaRequests.filter(url => url.searchParams.get('attempt') === '1');
    expect(successful.length).toBeGreaterThan(0);
    for (const url of successful) {
      expect(url.searchParams.get('asset')).toBe(asset);
      if (audience === 'student') for (const key of ['lesson', 'enrollment', 'revision']) expect(url.searchParams.get(key)).toBeTruthy();
    }
    const box = await video.boundingBox(); expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
    await expect(video).toHaveJSProperty('paused', true);
  });
}
