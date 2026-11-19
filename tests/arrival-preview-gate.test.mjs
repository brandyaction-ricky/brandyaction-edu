import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalPublicationEnabled } from '../features/campus/arrival/preview-gate.ts';
test('saved publications are read on production and fixed DEV, never on branch previews', () => {
  assert.equal(arrivalPublicationEnabled({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production' }), true);
  assert.equal(arrivalPublicationEnabled({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'development' }), true);
  assert.equal(arrivalPublicationEnabled({ VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_ENV: 'development' }), false);
});
