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
  t.mock.timers.tick(41250);
  const inbox = observeOffice('enrollment-A', view(), join);
  assert.equal(connections.length,1);
  assert.deepEqual(states,[true,true]);
  inbox.close();
  assert.equal(connections[0].aborted,false);
  const other = observeOffice('enrollment-B', view(), join);
  t.mock.timers.tick(41250);
  assert.equal(connections.length,2);
  desk.close();
  assert.equal(connections[0].aborted,true);
  assert.equal(connections[1].aborted,false);
  other.close();
  assert.equal(connections[1].aborted,true);
});

test('waiting views refresh only for a newer counter and stop probing once connected', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'], now:0});
  t.mock.method(Math, 'random', () => .5);
  let reads = 0, probes = 0, version = 3, ready;
  const box = startInboxSync({
    refresh: async () => { reads++; }, slow: () => false, onConnected: () => {},
    readVersion: async () => { probes++; return version; },
    join: async (_signal, onReady) => { ready = onReady; },
  });
  async function advance(ms) { t.mock.timers.tick(ms); await Promise.resolve(); }
  await advance(1100);
  await advance(80);
  assert.equal(reads,2);
  await advance(2000);
  await advance(80);
  assert.equal(reads,2);
  version++;
  await advance(2000);
  await advance(80);
  assert.equal(reads,3);
  await advance(27500);
  ready();
  const whenConnected = probes;
  await advance(10000);
  assert.equal(probes,whenConnected);
  box.close();
});

test('a stalled version read times out and a late response cannot replace the next probe', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:0});
  t.mock.method(Math,'random',()=>0);
  const requests=[],reads=[];
  let connected;
  const box=startInboxSync({
    refresh:async()=>{reads.push(Date.now());},slow:()=>false,onConnected:()=>{},
    join:async(_signal,ready)=>{connected=ready;},
    readVersion:signal=>new Promise(resolve=>requests.push({signal,resolve})),
  });
  const advance=async ms=>{t.mock.timers.tick(ms);await Promise.resolve();};
  await advance(400);
  assert.equal(requests.length,1);
  await advance(2500);
  assert.ok(requests[0].signal.aborted);
  await advance(1500);
  assert.equal(requests.length,2);
  requests[0].resolve(99);
  requests[1].resolve(1);
  await Promise.resolve();
  await advance(80);
  assert.deepEqual(reads,[0,4480]);
  await advance(1420);
  assert.equal(requests.length,3);
  connected();
  assert.ok(requests[2].signal.aborted);
  requests[2].resolve(100);
  await advance(80);
  box.close();
  await advance(15000);
  assert.equal(requests.length,3);
  assert.deepEqual(reads,[0,4480,5980]);
});
