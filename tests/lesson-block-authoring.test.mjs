import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const exports = {}; cache.set(name, exports);
  const source = fs.readFileSync(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports, request => load(request.replace('./', '')));
  return exports;
}
const { LessonDocumentWriter } = load('lesson-block-authoring');
const doc = text => ({ schemaVersion: 1, blocks: [{ id: 'body', type: 'text', content: text }], checklist: [] });

test('lost acknowledgment retries original revision and document before later edits', async () => {
  const writes = [], saved = [];
  let lost = true;
  const writer = new LessonDocumentWriter('old-revision', doc('기존 본문'), async request => {
    writes.push(structuredClone(request));
    if (!saved.includes(request.requestId)) saved.push(request.requestId);
    if (lost) { lost = false; throw new Error('response lost'); }
    return { revision: request.requestId };
  });
  const first = doc('첫 수정');
  await assert.rejects(writer.save('lesson', first), /response lost/);
  first.blocks[0].content = '외부 변경';
  const result = await writer.save('lesson', doc('최종 수정'));
  assert.deepEqual(writes[1], writes[0]);
  assert.equal(writes[1].document.blocks[0].content, '첫 수정');
  assert.equal(writes[2].expectedRevision, writes[0].requestId);
  assert.equal(writes[2].document.blocks[0].content, '최종 수정');
  assert.equal(result, writes[2].requestId);
  assert.equal(saved.length, 2);
  await writer.save('lesson', doc('최종 수정'));
  assert.equal(writes.length, 3, 'unchanged save does not create a revision');
});

test('conflict never automatically overwrites a different author revision', async () => {
  let calls = 0;
  const writer = new LessonDocumentWriter('old', doc('원본'), async () => { calls++; throw Object.assign(new Error('changed'), { status: 409 }); });
  await assert.rejects(writer.save('lesson', doc('내 변경')), /changed/);
  await assert.rejects(writer.save('lesson', doc('다시 수정')), error => error.status === 409);
  assert.equal(calls, 1);
});

test('concurrent clicks and wrong save acknowledgments do not advance revision', async () => {
  let resolve, received;
  const writer = new LessonDocumentWriter(null, null, async request => { received = request; return new Promise(done => { resolve = done; }); });
  const first = writer.save('new-lesson', doc('첫 본문'));
  await assert.rejects(writer.save('new-lesson', doc('다른 본문')), /저장하고 있습니다/);
  resolve({ revision: 'wrong-id' });
  await assert.rejects(first, /저장 결과/);
  const original = structuredClone(received);
  const retry = writer.save('new-lesson', doc('첫 본문'));
  assert.deepEqual(received, original);
  resolve({ revision: received.requestId });
  await retry;
});

test('invalid content never reaches the server and pending writes cannot change lesson', async () => {
  let calls = 0;
  const writer = new LessonDocumentWriter(null, null, async () => { calls++; throw new Error('offline'); });
  await assert.rejects(writer.save('lesson', { ...doc(''), schemaVersion: 99 }));
  assert.equal(calls, 0);
  await assert.rejects(writer.save('lesson', doc('정상 본문')), /offline/);
  await assert.rejects(writer.save('other-lesson', doc('다른 수업')), /다른 학습/);
  assert.equal(calls, 1);
});
