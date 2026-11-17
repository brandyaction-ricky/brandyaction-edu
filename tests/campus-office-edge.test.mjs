import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { prepareReport, deliverReport } from '../scripts/campus-office-report.mjs';

const built = await build({ entryPoints: ['supabase/functions/campus-office-report/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { receive } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const base = 'https://vjmjhaidlqkmascdjocw.supabase.co';
const binding = {
  connectorId: 'tester', keyVersion: 'v1', secret: 'a'.repeat(64),
  ownerId: '00000000-0000-4000-8000-000000000011', enrollmentId: '00000000-0000-4000-8000-000000000012',
  expiresAt: new Date(Date.now()+60000).toISOString(),
};
const jobId = '00000000-0000-4000-8000-000000000013';
const config = { ...binding, jobId, endpoint: base + '/functions/v1/campus-office-report', environment: 'development' };
const start = prepareReport({jobId,event:'started',expectedRevision:2});
const unexpected = () => assert.fail('Unexpected database access');
const send = (envelope, database, overrides = {}, key = binding.secret) =>
  deliverReport(config, envelope, key, (url, init) => receive(new Request(url,init),base,'server-only',JSON.stringify({...binding,...overrides}),database));

test('no stored key, expired key, wrong signature and non-DEV project cannot ingest', async () => {
  for (const [url, raw] of [[base,undefined],['https://other-project.supabase.co',JSON.stringify(binding)]]) {
    assert.equal((await receive(new Request(config.endpoint),url,'server-only',raw,unexpected)).status,404);
  }
  await assert.rejects(send(start,unexpected,{expiresAt:new Date(0).toISOString()}),/404/);
  await assert.rejects(send(start,unexpected,{},'b'.repeat(64)),/401/);
});
test('signed events are limited to one enrollment and jobs registered by that connector', async () => {
  const enroll = prepareReport({event:'registered',jobId,enrollmentId:binding.enrollmentId,objective:'dev scoped report',outputType:'analysis'});
  await assert.rejects(send(enroll,unexpected,{enrollmentId:jobId}),/403/);
  await assert.rejects(send(start,async url => {
    const params = new URL(url).searchParams;
    for (const [field,id] of [['id',jobId],['owner_id',binding.ownerId],['enrollment_id',binding.enrollmentId],['connector_id',binding.connectorId]]) assert.equal(params.get(field),'eq.'+id);
    return Response.json([]);
  }),/403/);
  await send(enroll,async (url, init) => {
    assert.ok(url.endsWith('/rpc/edu_campus_office_register'));
    assert.deepEqual(JSON.parse(init.body).p_allowed_owners,[binding.ownerId]);
    return Response.json({jobId,revision:1,status:'awaiting_connection'});
  });
});
test('HTTP success alone cannot confirm a different job or revision',async () => {
  await assert.rejects(deliverReport(config,start,binding.secret,async () => Response.json({jobId,revision:2})),/missing matching/);
});
