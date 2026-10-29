import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync(new URL('../lib/read-json.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { readJson } = exports;

test('read deadline: success, HTTP failure and invalid JSON stay distinguishable; no retry or write', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({url, options}); return new Response('{"error":"접근 권한이 없습니다"}', {status:403}); });
  const result = await readJson('/read');
  assert.equal(result.response.status, 403);
  assert.equal(result.data.error, '접근 권한이 없습니다');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, undefined);
  assert.equal(calls[0].options.cache, 'no-store');
  globalThis.fetch.mock.mockImplementation(async () => new Response('invalid'));
  await assert.rejects(readJson('/invalid'), /불러오지 못했습니다/);
});

test('hung fetch is aborted once with a recoverable timeout message', async t => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async (_url, {signal}) => new Promise((_, reject) => {
    count++;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
  }));
  await assert.rejects(readJson('/slow', {timeoutMs:10}), /지연되고 있습니다/);
  assert.equal(count, 1);
});

test('route cancellation stays an abort, not a timeout or a stale read result', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, {signal}) => new Promise((_, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once:true});
  }));
  const controller = new AbortController();
  const pending = readJson('/leave', {signal:controller.signal});
  controller.abort();
  await assert.rejects(pending, {name:'AbortError'});
  await assert.rejects(readJson('/already-left', {signal:controller.signal}), {name:'AbortError'});
});

test('deadline covers a stalled response body too', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, {signal}) => ({json: () => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
  })}));
  await assert.rejects(readJson('/body-stalled', {timeoutMs:10}), /지연되고 있습니다/);
});
