import test from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from './helpers/edu-tips-candidate-loader.mjs';
import { id, customer, epoch, receipt } from './helpers/edu-tips-erasure.mjs';

const erasure = candidate('edu-tips-erasure-http'), data = candidate('edu-tips-data-http'), eligibility = candidate('edu-tips-eligibility-http');
const env = { NEXT_PUBLIC_APP_ENV: 'development', EDU_TIPS_ERASURE_API_ENABLED: 'true', EDU_TIPS_DATA_API_ENABLED: 'true',
  EDU_TIPS_ELIGIBILITY_API_ENABLED: 'true', EDU_TIPS_ERASURE_CURSOR_SECRET: 'e'.repeat(48), EDU_TIPS_DATA_CURSOR_SECRET: 'd'.repeat(48) };
const request = bytes => new Request('https://synthetic.invalid/api', { method: 'POST', headers: {
  authorization: 'Bearer ' + 'synthetic-v2-test-key-not-registered-000000', 'content-type': 'application/json' }, body: bytes });
const rec = receipt({ request_id: id(1), customer_id: customer(5), consent_epoch: epoch(5) });
const subject = { customer_id: customer(5), consent_epoch: epoch(5) };
const { parseStrictTipsJson } = candidate('edu-tips-json');
test('strict parser preserves valid values and repeated names in separate objects', () => {
  const value = { subjects: [subject, { ...subject, customer_id: customer(6) }],
    text: '한글 😀 "key": {[]}', number: 123.5, zero: 0, enabled: false, empty: null };
  assert.deepEqual(parseStrictTipsJson(Buffer.from(JSON.stringify(value))), value);
  assert.deepEqual(parseStrictTipsJson(Buffer.from('{"a":{"name":1},"b":{"name":2},"name":3}')),
    { a: { name: 1 }, b: { name: 2 }, name: 3 });
});
test('strict parser detects decoded duplicate names in each nested object', () => {
  for (const body of ['{"a":1,"\\u0061":2}', '{"한":1,"\\ud55c":2}',
    '{"a":[{"b":1,"b":2}]}', '{"x":{"a":{},"a":[]}}', '{"__proto__":1,"__proto__":2}'])
    assert.throws(() => parseStrictTipsJson(Buffer.from(body)));
});
test('strict parser rejects malformed UTF-8 instead of substituting replacement characters', () => {
  for (const bytes of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xff], [0xe2, 0x82]])
    assert.throws(() => parseStrictTipsJson(Buffer.concat([Buffer.from('"'), Buffer.from(bytes), Buffer.from('"')])));
  assert.equal(parseStrictTipsJson(Buffer.from('"�"')), '�');
});
test('strict parser keeps syntax/BOM rejection and rejects overflow numbers', () => {
  for (const body of ['\ufeff{}', '{', '{}{}', '{"n":NaN}', '[1e400]', '{"n":-1e400}'])
    assert.throws(() => parseStrictTipsJson(Buffer.from(body)));
  assert.equal(parseStrictTipsJson(Buffer.from('1e300')), 1e300);
});
const cases = [
  ['receipt duplicate phase', 'receipts', JSON.stringify(rec).slice(0, -1) + ',"phase":"completed"}'],
  ['receipt escaped duplicate phase', 'receipts', JSON.stringify(rec).slice(0, -1) + ',"\\u0070hase":"completed"}'],
  ['receipt nested duplicate count', 'receipts', JSON.stringify(rec).replace('"events":0', '"events":0,"events":0')],
  ['ACK duplicate through', 'ack', '{"through":"ts_' + 'a'.repeat(86) + '","through":"ts_' + 'a'.repeat(86) + '"}'],
  ['recovery duplicate request ID', 'recovery', '{"requestId":"' + id(10) + '","reason":"initial","requestId":"' + id(11) + '"}'],
  ['recovery escaped duplicate reason', 'recovery', '{"requestId":"' + id(10) + '","reason":"initial","\\u0072eason":"initial"}'],
  ['eligibility duplicate subjects', 'eligibility', '{"subjects":[' + JSON.stringify(subject) + '],"subjects":[' + JSON.stringify(subject) + ']}'],
  ['eligibility nested duplicate identity', 'eligibility', '{"subjects":[' + JSON.stringify(subject).replace('"customer_id":', '"customer_id":"' + customer(6) + '","customer_id":') + ']}'],
];
for (const [label, action, body] of cases) test('TIPS JSON boundary: ' + label + ' cannot reach an operation RPC', async () => {
  let operations = 0;
  const rpc = async name => {
    if (name === 'edu_tips_erasure_http_gate' || name === 'edu_tips_data_gate') return { data: { consumer_id: id(90) }, error: null };
    operations++; return { data: null, error: { message: 'private synthetic operation diagnostic' } };
  };
  const result = action === 'eligibility' ? await eligibility.handleEligibility(request(body), { env, rpc: () => rpc('eligibility_operation') })
    : ['receipts', 'ack'].includes(action) ? await erasure.handleErasure(request(body), action, { env, rpc })
    : await data.handleData(request(body), action, { env, rpc });
  assert.equal(result.status, 400); assert.deepEqual(await result.json(), { error: 'invalid_request' });
  assert.equal(operations, 0);
});

test('existing OFF and unauthorized boundaries still stop before operation RPCs', async () => {
  const rpc = async () => { throw Error('unexpected RPC'); };
  for (const [api, action] of [[erasure, 'receipts'], [data, 'recovery'], [eligibility, null]]) {
    const run = (req, options) => action ? (api === erasure ? api.handleErasure(req, action, options)
      : api.handleData(req, action, options)) : api.handleEligibility(req, options);
    assert.equal((await run(request('{}'), { env: {}, rpc })).status, 503);
    const req = request('{}'); req.headers.delete('authorization');
    assert.equal((await run(req, { env, rpc })).status, 401);
  }
});

test('receipt reader rejects a duplicate key split over body chunks before mutation', async () => {
  const raw = Buffer.from(JSON.stringify(rec).slice(0, -1) + ',"\\u0070hase":"completed"}');
  let operations = 0;
  const stream = new ReadableStream({ start(controller) {
    for (let i = 0; i < raw.length; i += 7) controller.enqueue(raw.subarray(i, i + 7));
    controller.close();
  } });
  const req = new Request('https://synthetic.invalid/api', { method: 'POST', headers: request('').headers,
    body: stream, duplex: 'half' });
  const result = await erasure.handleErasure(req, 'receipts', { env, rpc: async name => {
    if (name === 'edu_tips_erasure_http_gate') return { data: { consumer_id: id(90) }, error: null };
    operations++; return { data: null, error: null };
  } });
  assert.equal(result.status, 400); assert.equal(operations, 0);
});
