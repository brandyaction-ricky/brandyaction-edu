import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path, mocks) {
  const source = await readFile(path, 'utf8');
  const {outputText} = ts.transpileModule(source, {
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, name => {
    assert.ok(name in mocks, name);
    return mocks[name];
  });
  return exports;
}

const event = {id:'moonshot-live-20261207', startsAt:'2026-12-07T21:00:00+09:00'};
const dev = {
  VERCEL_ENV:'preview', NEXT_PUBLIC_APP_ENV:'development',
  EDU_CAMPUS_ARRIVAL_REMINDERS_ENABLED:'1',
  NEXT_PUBLIC_SUPABASE_URL:'https://vjmjhaidlqkmascdjocw.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'unit-test-placeholder',
};
const stores = [];
const reminder = await loadModule('features/campus/arrival/live-reminder-server.ts', {
  './config': {DEFAULT_ARRIVAL:{},arrivalLiveEvent:() => event},
  '@/lib/supabase/admin': {createAdminClient:() => ({
    from(table) {
      assert.equal(table, 'edu_campus_arrival_live_reminders');
      return {upsert(values,options) {
        stores.push({values,options});
        return {abortSignal:async () => ({error:null})};
      }};
    },
  })},
});

test('reminders require the explicit feature flag, development application, Preview and the DEV database', () => {
  assert.equal(reminder.arrivalLiveReminderEnabled(dev), true);
  for (const [name, value] of [
    ['VERCEL_ENV','production'], ['NEXT_PUBLIC_APP_ENV','production'],
    ['EDU_CAMPUS_ARRIVAL_REMINDERS_ENABLED','0'], ['SUPABASE_SERVICE_ROLE_KEY',''],
    ['NEXT_PUBLIC_SUPABASE_URL','https://qitqxizuwmmlhlcgsrqe.supabase.co'],
    ['NEXT_PUBLIC_SUPABASE_URL','https://vjmjhaidlqkmascdjocw.supabase.co.example.com'],
  ]) assert.equal(reminder.arrivalLiveReminderEnabled({...dev,[name]:value}),false, name);
  assert.equal(reminder.arrivalLiveReminderOpen(Date.parse(event.startsAt) - 1), true);
  assert.equal(reminder.arrivalLiveReminderOpen(Date.parse(event.startsAt)), false);
});

const body = await loadModule('features/campus/space/body.ts', {
  '../snapshot':{campusError: (status,message) => {throw Object.assign(Error(message), {status});}},
});
let enabled = true, open = true, fail = false;
const route = await loadModule('app/api/campus/arrival/live-reminder/route.ts', {
  '@/features/campus/arrival/live-reminder-server': {
    ...reminder,
    arrivalLiveReminderEnabled:() => enabled,
    arrivalLiveReminderOpen:() => open,
    registerArrivalLiveReminder:phone => {
      if (fail) throw Error('test database failure with private details');
      return reminder.registerArrivalLiveReminder(phone);
    },
  },
  '@/features/campus/space/body':body,
});

test('endpoint requires same-origin, a bounded two-field submission, valid phone and literal opt-in', async () => {
  const origin = 'https://preview.example.com';
  const request = (value, source = origin) => new Request(origin + '/api/campus/arrival/live-reminder', {
    method:'POST', headers:{origin:source,'Content-Type':'application/json'},body:JSON.stringify(value),
  });
  const national = {phone:'010-0000-0042',consent:true};
  enabled = false;
  assert.equal((await route.POST(request(national))).status, 404);
  enabled = true;
  assert.equal((await route.POST(request(national,'https://other.example.com'))).status, 403);
  open = false;
  assert.equal((await route.POST(request(national))).status, 410);
  open = true;
  for (const input of [
    null, [], {phone:national.phone}, {...national,consent:'true'}, {...national,consent:false},
    {...national,phone:'call 01000000042'}, {...national,phone:'02-000-1234'},
    {...national,phone:'0'.repeat(260)}, {...national,event_id:'other-event'},
  ]) assert.equal((await route.POST(request(input))).status, 400);
  assert.equal(stores.length, 0);
  fail = true;
  const unavailable = await route.POST(request(national));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {error:'unavailable'});
  fail = false;
  for (const phone of [national.phone, '+82 (0)10-0000-0042', '+82 10 0000 0042']) {
    const response = await route.POST(request({phone,consent:true}));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), {registered:true});
  }
  assert.deepEqual(stores, Array.from({length:3}, () => ({
    values:{event_id:event.id,phone:'01000000042',consent_version:1},
    options:{onConflict:'event_id,phone',ignoreDuplicates:true},
  })));
});
