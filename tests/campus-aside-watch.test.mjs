import test from 'node:test';
import assert from 'node:assert/strict';
import { observeTask, promptDigest } from '../scripts/campus-aside-watch.mjs';
const prompt = '지정된 검수 업무 123';
const config = { sessionId: 'pilot-session', connectionId: 'pilot-connection', promptHash: promptDigest(prompt), notBefore: 100 };
const session = { id: config.sessionId, trigger: { type: 'channel', channel: 'telegram', connectionId: config.connectionId }, status: 'running' };
const user = { role: 'user', content: [{ type: 'text', text: prompt }], timestamp: 110 };
const start = { role: 'turn-lifecycle', event: 'started', turnId: 'turn-one', timestamp: 120 };
const answer = { role: 'assistant', content: [{ type: 'text', text: '공식 자료를 확인한 실제 검수용 결과입니다.' }], timestamp: 130, stopReason: 'stop' };
const finish = { role: 'turn-lifecycle', event: 'finished', turnId: 'turn-one', timestamp: 140 };
test('only exact Telegram request and its actual lifecycle produce a result', () => {
  assert.equal(observeTask({ session, messages: [answer, finish] }, config).phase, 'waiting');
  assert.equal(observeTask({ session, messages: [user] }, config).phase, 'accepted');
  assert.equal(observeTask({ session, messages: [start, user] }, config).phase, 'running');
  assert.deepEqual(observeTask({ session, messages: [finish, answer, start, user] }, config), { phase: 'review', turnId: 'turn-one', answer: answer.content[0].text });
});
test('old answers, another sender follow-up, wrong connection and missing result fail closed', () => {
  assert.throws(() => observeTask({ session: { ...session, trigger: { ...session.trigger, connectionId: 'other' } }, messages: [user] }, config), /binding/);
  assert.throws(() => observeTask({ session, messages: [{ ...user, timestamp: 90 }] }, config), /predates/);
  assert.throws(() => observeTask({ session, messages: [finish, answer, start, user, { ...user, content: '다른 부탁', timestamp: 125 }] }, config), /follow-up/);
  assert.throws(() => observeTask({ session, messages: [finish, { ...answer, timestamp: 90 }, start, user] }, config), /no final answer/);
  assert.throws(() => observeTask({ session, messages: [user, { ...user, timestamp: 111 }] }, config), /Duplicate/);
  assert.equal(observeTask({ session: { ...session, status: 'errored' }, messages: [start, user] }, config).phase, 'failed');
});
