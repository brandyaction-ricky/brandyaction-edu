import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { prepareReport, deliverReport } from '../scripts/campus-office-report.mjs';
const built = await build({ entryPoints: ['features/campus/office/webhook.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { handleOfficeWebhook } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const jobId = '00000000-0000-4000-8000-000000000001';
const secret = 'local-test-only-'.repeat(4);
const config = { environment: 'development', endpoint: 'https://dev.example.test/api/campus/office/webhook', connectorId: 'pilot', keyVersion: 'v1', jobId };
const input = { jobId, expectedRevision: 1, event: 'accepted', note: '실제 접수 후 보고' };
test('PC report matches existing webhook; lost acknowledgement retries the same immutable event with fresh signature', async () => {
  const envelope = prepareReport(input), receipts = new Map();
  let now = Date.now(), attempts = 0;
  const transport = async (url, init) => {
    assert.equal(init.redirect, 'error');
    const response = await handleOfficeWebhook(new Request(url, init), {
      enabled: true, now, connectors: [{ id: 'pilot', keyVersion: 'v1', secret, ownerIds: [jobId] }],
      ingest: async event => { receipts.set(event.eventId, event.payloadHash); return { status: 'queued' }; },
    });
    if (++attempts === 1) throw new Error('Acknowledgement lost');
    return response;
  };
  await assert.rejects(deliverReport(config, envelope, secret, transport, now), /unconfirmed/);
  now += 600000;
  const result = await deliverReport(config, envelope, secret, transport, now);
  assert.equal(result.delivered, true); assert.equal(receipts.size, 1); assert.equal(attempts, 2);
});
test('rejects wrong job, insecure endpoint, dispatched job and altered saved payload before sending', async () => {
  let calls = 0; const transport = async () => { calls++; return new Response('{}'); };
  const envelope = prepareReport(input);
  await assert.rejects(deliverReport({ ...config, jobId: jobId.replace(/1$/, '2') }, envelope, secret, transport), /configured job/);
  await assert.rejects(deliverReport({ ...config, endpoint: 'http://dev.example.test/api/campus/office/webhook' }, envelope, secret, transport), /configuration/);
  await assert.rejects(deliverReport(config, { ...envelope, raw: envelope.raw + ' ' }, secret, transport), /configured job/);
  assert.throws(() => prepareReport({ ...input, dispatchId: jobId }), /Dispatched/);
  assert.throws(() => prepareReport({ ...input, event: 'draft', draftText: 'x' }), /text/);
  assert.equal(calls, 0);
});
test('revision conflict is visible, with no automatic retry or invented completion', async () => {
  let calls = 0;
  await assert.rejects(deliverReport(config, prepareReport(input), secret, async () => { calls++; return new Response('{}', { status: 409 }); }), /HTTP 409/);
  assert.equal(calls, 1);
});
