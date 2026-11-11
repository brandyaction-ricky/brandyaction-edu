import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const entry = fileURLToPath(new URL('../features/campus/office/inbox-sync.ts', import.meta.url));
const compiled = await build({entryPoints:[entry], bundle:true, format:'esm', write:false});
const {startInboxSync} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));

test('repeated transport failures and backoff never move the fifteen-second read deadline', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'], now:0});
  t.mock.method(Math, 'random', () => 0);
  const reads = [], joins = [];
  const box = startInboxSync({
    refresh: async () => { reads.push(Date.now()); }, slow: () => false,
    onConnected: () => {}, onError: assert.fail,
    join: async (signal, ready, failed) => { joins.push({signal, ready, failed}); },
  });
  await Promise.resolve();
  t.mock.timers.tick(0);
  for (let i = 0; i < 10; i++) {
    joins.at(-1).failed();
    t.mock.timers.tick(5000);
    await Promise.resolve();
  }
  assert.deepEqual(reads, [0, 15000, 30000, 45000]);
  assert.ok(joins.length > 1 && joins.length < 10);
  const last = joins.at(-1);
  box.close();
  last.ready();
  t.mock.timers.tick(90000);
  assert.equal(reads.length, 4);
  assert.ok(joins.every(j => j.signal.aborted));
});

test('a staggered first join leaves the initial read immediate and is cancelled on close', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'], now:0});
  t.mock.method(Math, 'random', () => .75);
  let joins = 0, reads = 0;
  const box = startInboxSync({ refresh: async () => { reads++; }, slow: () => false,
    onConnected: () => {}, onError: assert.fail, join: async () => { joins++; } });
  assert.equal(reads,1);
  await Promise.resolve();
  t.mock.timers.tick(2249);
  assert.equal(joins,0);
  box.close();
  t.mock.timers.tick(60000);
  assert.equal(joins,0);
  assert.equal(reads,1);
});

test('desk and inbox share the connected enrollment until its last observer leaves', async t => {
  const source = fileURLToPath(new URL('../features/campus/office/shared-inbox.ts', import.meta.url));
  const built = await build({entryPoints:[source], bundle:true, format:'esm', write:false});
  const {observeOffice} = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64'));
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'], now:0});
  t.mock.method(Math, 'random', () => .75);
  const connections = [];
  const join = async (signal, ready) => { connections.push(signal); ready(); };
  const states = [];
  const view = () => ({refresh:async()=>{}, slow:()=>false, connected:value=>states.push(value)});
  const desk = observeOffice('enrollment-A', view(), join);
  t.mock.timers.tick(2250);
  const inbox = observeOffice('enrollment-A', view(), join);
  assert.equal(connections.length,1);
  assert.deepEqual(states,[true,true]);
  inbox.close();
  assert.equal(connections[0].aborted,false);
  const other = observeOffice('enrollment-B', view(), join);
  t.mock.timers.tick(2250);
  assert.equal(connections.length,2);
  desk.close();
  assert.equal(connections[0].aborted,true);
  assert.equal(connections[1].aborted,false);
  other.close();
  assert.equal(connections[1].aborted,true);
});
