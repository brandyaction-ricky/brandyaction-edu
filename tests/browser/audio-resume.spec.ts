import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';

function wave(seconds: number) {
  const bytes = Buffer.alloc(44 + 8000 * 2 * seconds);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
const bytes = wave(600);

for (const resume of [true, false]) test(`private audio recovers a failed range request and stays ${resume ? 'playing' : 'paused'} at the requested position`, async ({ page }) => {
  let expired = false, grants = 0, denied = 0;
  const pending: (() => void)[] = [];
  const server = createServer((req, res) => {
    const start = Number(/bytes=(\d+)-/.exec(req.headers.range || '')?.[1] || 0);
    const grant = new URL(req.url!, 'http://localhost').searchParams.get('grant');
    const send = () => {
      if (res.destroyed) return;
      if (grant === '1' && expired) { denied++; res.writeHead(403); res.end('expired'); return; }
      const end = grant === '1' ? Math.min(bytes.length - 1, start + 1048575) : bytes.length - 1;
      res.writeHead(206, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
      res.end(bytes.subarray(start, end + 1));
    };
    if (grant === '1' && start > 0 && !expired) pending.push(send); else send();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test media port');
  try {
    await page.route('**/api/platform/lesson-media**', r => r.fulfill({ status: 303, headers: { Location: `http://127.0.0.1:${address.port}/voice.wav?grant=${++grants}`, 'Cache-Control': 'private, no-store' } }));
    await page.goto('/floating-audio-test');
    const audio = page.locator('audio').last();
    await audio.evaluate((a: HTMLAudioElement) => { a.dataset.identity = 'original'; a.playbackRate = 1.5; a.volume = 0.3; return a.play(); });
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.2);
    await audio.evaluate((a: HTMLAudioElement) => a.pause());
    expired = true;
    await audio.evaluate((a: HTMLAudioElement, resume) => { a.currentTime = 400; if (resume) void a.play().catch(() => {}); }, resume);
    pending.forEach(send => send());
    await expect.poll(() => denied).toBeGreaterThan(0);
    await expect.poll(() => grants).toBe(2);
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThanOrEqual(400);
    await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.paused)).toBe(!resume);
    await expect(audio).toHaveAttribute('data-identity', 'original');
    expect(await audio.evaluate((a: HTMLAudioElement) => [a.playbackRate, a.volume])).toEqual([1.5, 0.3]);
    if (resume) {
      await page.evaluate(() => window.scrollBy(0, 1200));
      await expect(page.locator('.is-floating audio')).toHaveAttribute('data-identity', 'original');
      expect(await audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThanOrEqual(400);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test('a persistent failure stops retrying and offers a manual retry', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/platform/lesson-media**', r => {
    requests++;
    return r.fulfill(requests <= 2 ? { status: 403, body: 'unavailable' } : { contentType: 'audio/wav', body: bytes });
  });
  await page.goto('/floating-audio-test?inline');
  const audio = page.locator('audio').last();
  await audio.evaluate((a: HTMLAudioElement) => { void a.play().catch(() => {}); });
  await expect(page.getByRole('alert')).toBeVisible();
  expect(requests).toBe(2);
  await page.getByRole('button', { name: '자료 다시 열기' }).click();
  await audio.evaluate((a: HTMLAudioElement) => a.play());
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0.2);
  expect(requests).toBe(3);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const action of ['another player', 'pause', 'navigation']) test(`recovery respects ${action} while reconnecting`, async ({ page }) => {
  let requests = 0;
  const waiting: (() => void)[] = [];
  await page.route('https://audio.example.test/**', r => r.fulfill({ contentType: 'audio/wav', body: bytes }));
  await page.route('**/api/platform/lesson-media**', async r => {
    requests++;
    if (requests === 1) return r.fulfill({ status: 403, body: 'unavailable' });
    await new Promise<void>(resolve => waiting.push(resolve));
    await r.fulfill({ contentType: 'audio/wav', body: bytes }).catch(() => {});
  });
  await page.goto('/floating-audio-test');
  const first = page.locator('audio').first(), second = page.locator('audio').last();
  await second.evaluate((a: HTMLAudioElement) => { void a.play().catch(() => {}); });
  await expect.poll(() => requests).toBe(2);
  const previous = await second.elementHandle();
  if (action === 'another player') await first.evaluate((a: HTMLAudioElement) => a.play());
  else if (action === 'pause') await second.evaluate((a: HTMLAudioElement) => { void a.play().catch(() => {}); a.pause(); });
  else await page.getByRole('button', { name: '다른 수업 열기' }).click();
  waiting.forEach(resolve => resolve());
  if (action === 'navigation') {
    expect(await previous!.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
    return;
  }
  await expect.poll(() => second.evaluate((a: HTMLAudioElement) => a.readyState)).toBeGreaterThanOrEqual(1);
  expect(await second.evaluate((a: HTMLAudioElement) => a.paused)).toBe(true);
  if (action === 'another player') expect(await first.evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
});
