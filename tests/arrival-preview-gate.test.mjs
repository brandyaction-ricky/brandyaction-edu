import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalPreviewClosed } from '../features/campus/arrival/preview-gate.ts';
test('visitor journey opens on branch previews and fixed DEV, stays closed on production', () => {
  assert.equal(arrivalPreviewClosed({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production' }), true);
  assert.equal(arrivalPreviewClosed({ VERCEL_ENV: 'production' }), true);
  assert.equal(arrivalPreviewClosed({ VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_ENV: 'production' }), true);
  assert.equal(arrivalPreviewClosed({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'development' }), false);
  assert.equal(arrivalPreviewClosed({ VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_ENV: 'development' }), false);
});
