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
  t.mock.timers.tick(14999);
  assert.equal(joins,0);
  box.close();
  t.mock.timers.tick(60000);
  assert.equal(joins,0);
  assert.equal(reads,1);
});
