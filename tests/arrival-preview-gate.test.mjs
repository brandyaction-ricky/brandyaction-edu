import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivalPublicationEnabled, arrivalRequiresPublication } from '../features/campus/arrival/preview-gate.ts';
test('saved publications are read on production and fixed DEV, never on branch previews', () => {
  assert.equal(arrivalPublicationEnabled({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production' }), true);
  assert.equal(arrivalPublicationEnabled({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'development' }), true);
  assert.equal(arrivalPublicationEnabled({ VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_ENV: 'development' }), false);
});
test('only real production requires a published snapshot before showing visitors anything', () => {
  assert.equal(arrivalRequiresPublication({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production' }), true);
  assert.equal(arrivalRequiresPublication({ VERCEL_ENV: 'production' }), true);
  assert.equal(arrivalRequiresPublication({ VERCEL_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'development' }), false);
  assert.equal(arrivalRequiresPublication({ VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_ENV: 'development' }), false);
});
