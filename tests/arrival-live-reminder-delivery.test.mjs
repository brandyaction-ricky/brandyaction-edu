import assert from 'node:assert/strict';
import {createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import ts from 'typescript';

const event = 'moonshot-live-20261207';
const startsAt = '2026-12-07T12:00:00Z';
const proposedSendAt = '2026-12-07T11:30:00Z';
const purgeAt = '2026-12-07T23:30:00+09:00';
const message = '검수 메시지';
const consentVersion = 2;
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = name => read(`supabase/migrations/${name}.sql`);
const phone = n => '0100000' + n.toString().padStart(4, '0');
const providerGroup = n => 'G4V' + n.toString().padStart(29, '0');
const oldMigration = sql('20261119061959_edu_campus_arrival_live_reminders');
const migration = sql('20261119233002_edu_campus_arrival_live_reminder_delivery');

test('deployed intake stays compatible, and claims, receipt and purge stay event-scoped', async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(oldMigration);
  await db.exec('set role service_role');
  const intake = (id, number, version = 1, cutoff = '2026-12-07T11:59:58Z') => db.query(
    'insert into edu_campus_arrival_live_reminders (event_id,phone,consent_version,consented_at) values ($1,$2,$3,$4) on conflict (event_id,phone) do nothing',
    [id, number, version, cutoff],
  );
  await intake(event, phone(1));
  await db.exec('reset role');
  await db.exec(migration);
  const claim = (size, batch = randomUUID()) => db.query(
    'select * from edu_claim_campus_arrival_reminders($1,$2,$3,$4,$5)',
    [event, consentVersion, startsAt, batch, size],
  );
  const purge = () => db.query('select edu_purge_campus_arrival_reminders($1,$2) as result', [event, consentVersion]);
  const refresh = () => db.query('select edu_refresh_campus_arrival_reminder_consent($1,$2,$3) as result', [event, phone(1), consentVersion]);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(claim(1), /permission denied/);
    await assert.rejects(purge(), /permission denied/);
    await assert.rejects(refresh(), /permission denied/);
    await assert.rejects(db.query('select * from edu_campus_arrival_reminder_batches'), /permission denied/);
    await assert.rejects(db.query('select * from edu_campus_arrival_reminder_purges'), /permission denied/);
  }
  await db.exec('set role service_role');
  await intake(event, phone(1)); // duplicate
  await intake(event, phone(2)); // stale consent version, ineligible until renewed
  await intake(event, phone(3), consentVersion, startsAt); // past the enrollment cutoff
  await intake('moonshot-live-20261208', phone(4)); // other event
  assert.equal((await claim(10)).rows.length, 0);
  assert.equal((await refresh()).rows[0].result, true);
  const firstRenewal = (await db.query('select consented_at from edu_campus_arrival_live_reminders where phone=$1',[phone(1)])).rows[0].consented_at;
  await refresh();
  assert.deepEqual((await db.query('select consented_at from edu_campus_arrival_live_reminders where phone=$1',[phone(1)])).rows[0].consented_at, firstRenewal);
  // The synthetic campaign window is fixed even when run after the real event.
  await db.query('update edu_campus_arrival_live_reminders set consented_at=$1 where phone=$2', ['2026-12-07T11:59:58Z', phone(1)]);
  const id = randomUUID();
  assert.deepEqual((await claim(1, id)).rows, [{phone: phone(1)}]);
  assert.equal((await claim(1)).rows.length, 0);
  await intake(event, phone(5), consentVersion, '2026-12-07T11:59:59Z'); // follows first claim
  assert.deepEqual((await claim(10)).rows, [{phone: phone(5)}]);
  await db.query(`update edu_campus_arrival_reminder_batches set status='accepted', provider_group_id=$2,
    accepted_count=1 where id=$1`, [id, providerGroup(1)]);
  const purged = (await purge()).rows[0].result;
  assert.equal(purged.removed_count, 4);
  assert.equal(purged.eligible_unsent_count, 1);
  assert.deepEqual((await purge()).rows[0].result, purged);
  assert.deepEqual((await db.query('select event_id, phone from edu_campus_arrival_live_reminders')).rows,
    [{event_id: 'moonshot-live-20261208', phone: phone(4)}]);
  const results = (await db.query('select status,error_code,provider_group_id from edu_campus_arrival_reminder_batches order by error_code')).rows;
  assert.deepEqual(results, [
    {status: 'unknown', error_code: 'RECEIPT_UNCONFIRMED', provider_group_id: null},
    {status: 'unknown', error_code: 'SUBMISSION_UNCONFIRMED', provider_group_id: null},
  ]);
});

function load(path, modules, env, fetch) {
  const {outputText} = ts.transpileModule(read(path), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  });
  const exports = {};
  new Function('exports', 'require', 'process', 'fetch', outputText)(
    exports, id => {
      assert.ok(id in modules, `Unexpected import: ${id}`);
      return modules[id];
    }, {env}, fetch,
  );
  return exports;
}

function harness({recipientCount = 0, outcome = 'accepted', env = {}, publicationStarts = startsAt} = {}) {
  const queued = Array.from({length: recipientCount}, (_, index) => ({phone: phone(index)}));
  const posts = [], calls = [], batches = [];
  const config = {
    EDU_CAMPUS_ARRIVAL_REMINDER_PURGE_AT: purgeAt, EDU_CAMPUS_ARRIVAL_REMINDER_SEND_ENABLED: 'true',
    CRM_DELIVERY_ENABLED: 'true', SOLAPI_API_KEY: 'test-dummy', SOLAPI_API_SECRET: 'test-secret', ...env,
  };
  const modules = {
    'node:crypto': {createHmac, randomBytes, randomUUID},
    './live-reminder-consent': {arrivalLiveReminderConsentVersion: consentVersion},
    './live-reminder-server': {
      arrivalLiveReminderEvent: {id: event},
      arrivalLiveReminderProduction: () => env.production !== false,
      liveReminderPreview: {liveStartsAt: startsAt, proposedSendAt, message},
    },
    './publication-server': {readPublishedArrival: async () => ({config: {startsAt: publicationStarts}})},
    '@/lib/crm-sms-settings': {loadSmsSettings: async () => ({transactionalEnabled: true, senderPhone: '0212345678'})},
    '@/lib/supabase/admin': {createAdminClient: () => ({
      rpc(name, args) {
        assert.equal(args.p_event, event);
        calls.push(name);
        return {abortSignal: async () => {
          assert.equal(args.p_consent_version, consentVersion);
          if (name === 'edu_purge_campus_arrival_reminders') return {data: {removed_count: 4, eligible_unsent_count: 0}};
          assert.equal(name, 'edu_claim_campus_arrival_reminders');
          assert.equal(args.p_cutoff, new Date(startsAt).toISOString());
          const data = queued.splice(0, args.p_limit);
          if (data.length) batches.push({id: args.p_batch, recipient_count: data.length, status: 'claimed', accepted_count: 0, rejected_count: 0, delivered_count: 0, failed_count: 0});
          return {data};
        }};
      },
      from(table) {
        return {
          data: table === 'edu_campus_arrival_reminder_purges' ? null : batches,
          select() {return this;},
          update(update) {this.updateValue = update; return this;},
          eq(key, value) {if (key !== 'event_id') this.data = this.data.filter(row => row[key] === value); return this;},
          lt() {this.data = []; return this;},
          order() {return this;},
          limit(n) {this.data = this.data.slice(0, n); return this;},
          abortSignal() {return this;},
          async maybeSingle() {return {data: this.data};},
          async then(resolve) {
            if (this.updateValue) this.data.forEach(row => Object.assign(row, this.updateValue));
            resolve({data: this.data});
          },
        };
      },
    })},
  };
  const fakeFetch = async (url, options) => {
    assert.match(url, /^https:\/\/api\.solapi\.com\/messages\/v4\//);
    assert.equal(options.redirect, 'error');
    const [, date, salt, signature] = /date=([^,]+), salt=([a-f0-9]+), signature=([a-f0-9]+)$/.exec(options.headers.Authorization);
    assert.equal(signature, createHmac('sha256', config.SOLAPI_API_SECRET).update(date + salt).digest('hex'));
    if (options.method === 'GET') {
      const group = batches.find(batch => url.endsWith(batch.provider_group_id));
      const {accepted_count: accepted} = group;
      return Response.json({
        status: 'COMPLETE', count: {sentSuccess: Math.max(0, accepted - 1), sentFailed: 1},
      });
    }
    const body = JSON.parse(options.body);
    posts.push(body);
    assert.equal(body.allowDuplicates, false);
    assert.equal(body.showMessageList, false);
    assert.ok(body.messages.every(entry => entry.type === 'LMS' && entry.text === message && entry.from === '0212345678'));
    if (outcome === 'unknown') throw Error('simulated response lost');
    return Response.json({
      groupInfo: {groupId: providerGroup(posts.length), count: {
        registeredSuccess: body.messages.length === 1 ? 1 : body.messages.length - 1,
        registeredFailed: body.messages.length === 1 ? 0 : 1,
      }},
    });
  };
  return {posts, calls, batches, queued, ...load('features/campus/arrival/live-reminder-delivery.ts', modules, config, fakeFetch)};
}

test('a synthetic 8,000 opt-ins are claimed once, and late consent is handled by the final tick', async () => {
  const h = harness({recipientCount: 8000});
  await h.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt));
  assert.equal(h.posts.length, 8);
  assert.equal(new Set(h.posts.flatMap(body => body.messages.map(entry => entry.to))).size, 8000);
  h.queued.push({phone: phone(8000)});
  await h.runArrivalLiveReminderDelivery(() => Date.parse(startsAt) + 500);
  assert.equal(h.posts.length, 9);
  await h.runArrivalLiveReminderDelivery(() => Date.parse(startsAt) + 60_000);
  assert.equal(h.posts.length, 9);
  const summary = await h.readArrivalReminderDeliverySummary(Date.parse(startsAt));
  assert.deepEqual(Object.fromEntries(Object.entries(summary).filter(([, value]) => typeof value === 'number')),
    {accepted: 7993, delivered: 7984, failed: 17, pending: 0, unconfirmed: 0, skipped: 0});
});

test('an ambiguous provider result is recorded and the same recipients cannot be sent again', async () => {
  const h = harness({recipientCount: 3, outcome: 'unknown'});
  assert.equal((await h.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt))).unknown, 3);
  assert.equal(h.batches[0].error_code, 'SUBMISSION_UNCONFIRMED');
  await h.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt) + 60_000);
  assert.equal(h.posts.length, 1);
  assert.equal((await h.readArrivalReminderDeliverySummary()).unconfirmed, 3);
});

test('calling before the window, with production mismatch or with sending paused cannot contact SOLAPI', async () => {
  const h = harness({recipientCount: 2});
  assert.deepEqual(await h.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt) - 1), {state: 'waiting'});
  assert.deepEqual(await h.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt), true), {state: 'waiting'});
  assert.equal(h.calls.length, 0);
  const wrongDate = harness({recipientCount: 2, publicationStarts: '2026-12-08T12:00:00Z'});
  await assert.rejects(wrongDate.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt)), /time mismatch/);
  assert.equal(wrongDate.posts.length, 0);
  const outsideCron = harness({env: {EDU_CAMPUS_ARRIVAL_REMINDER_PURGE_AT: '2026-12-08T09:00:00+09:00'}});
  await assert.rejects(outsideCron.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt)), /deletion time is not configured/);
  assert.equal(outsideCron.calls.length, 0);
  const wrongEnvironment = harness({recipientCount: 2, env: {production: false}});
  assert.deepEqual(await wrongEnvironment.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt)), {state: 'disabled'});
  assert.equal(wrongEnvironment.calls.length, 0);
  const paused = harness({recipientCount: 2, env: {EDU_CAMPUS_ARRIVAL_REMINDER_SEND_ENABLED: 'false', SOLAPI_API_KEY: ''}});
  assert.deepEqual(await paused.runArrivalLiveReminderDelivery(() => Date.parse(proposedSendAt)), {state: 'waiting'});
  assert.deepEqual(await paused.runArrivalLiveReminderDelivery(() => Date.parse(purgeAt)), {state: 'purged', removed: 4, unclaimed: 0});
  const followingYear = Date.parse('2027-12-07T12:00:00Z');
  assert.deepEqual(await paused.runArrivalLiveReminderDelivery(() => followingYear), {state: 'disabled'});
  assert.deepEqual(await paused.runArrivalLiveReminderDelivery(() => followingYear, true), {state: 'purged', removed: 4, unclaimed: 0});
  assert.equal(paused.posts.length, 0);
});

test('the scheduled route checks CRON_SECRET and HEAD cannot dispatch', async () => {
  let called = 0;
  const route = load('app/api/cron/moonshot-live-reminder/route.ts', {
    'node:crypto': {timingSafeEqual},
    '@/features/campus/arrival/live-reminder-delivery': {runArrivalLiveReminderDelivery: async (_now, recover) => {called++; return {state: recover ? 'purged' : 'waiting'};}},
  }, {CRON_SECRET: 'test-secret'}, undefined);
  const request = authorization => new Request('https://example.test', {headers: {authorization}});
  assert.equal((await route.HEAD()).status, 405);
  assert.equal((await route.GET(request('Bearer wrong'))).status, 401);
  assert.equal(called, 0);
  const response = await route.GET(request('Bearer test-secret'));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {state: 'waiting'});
  assert.equal(called, 1);
  const recovery = await route.GET(new Request('https://example.test?recover=1', {headers: {authorization: 'Bearer test-secret'}}));
  assert.deepEqual(await recovery.json(), {state: 'purged'});
});
