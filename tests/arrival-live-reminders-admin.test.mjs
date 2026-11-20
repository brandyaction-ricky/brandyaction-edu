import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/admin/crm/live-reminders/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const preview = {proposedSendAt:'2026-12-07T11:30:00.000Z',liveStartsAt:'2026-12-07T21:00:00+09:00',message:'안내 문자 초안'};

function loadRoute({enabled = true, authorised = true, read, readDelivery = async () => null}) {
  const permissions = [];
  const exports = {};
  const dependencies = {
    '@/features/campus/arrival/live-reminder-server': {
      arrivalLiveReminderEnabled: () => enabled,
      liveReminderPreview: preview,
      readArrivalLiveReminders: read,
    },
    '@/features/campus/arrival/live-reminder-delivery': {readArrivalReminderDeliverySummary: readDelivery},
    '@/lib/operator-permissions': {
      getOperatorUser: async scope => {
        permissions.push(scope);
        return authorised ? {id: 'marketing-staff'} : null;
      },
    },
  };
  new Function('exports', 'require', compiled)(exports, name => {
    assert.ok(dependencies[name], `Unexpected import: ${name}`);
    return dependencies[name];
  });
  return {GET: exports.GET, permissions};
}

test('CRM campaigns can show the reminder panel in both production and DEV', () => {
  const workflows = readFileSync(new URL('../app/ui/admin-workflows.tsx', import.meta.url), 'utf8');
  assert.match(workflows, /\{section === "campaigns" && <LiveReminderIntake\s*\/>\}/);
});

test('live reminder CRM checks the environment and marketing access before reading', async () => {
  let reads = 0;
  const read = async () => { reads += 1; };
  const disabled = loadRoute({enabled: false, read});
  const noPermission = loadRoute({authorised: false, read});
  assert.equal((await disabled.GET()).status, 404);
  assert.deepEqual(disabled.permissions, []);
  assert.equal((await noPermission.GET()).status, 403);
  assert.deepEqual(noPermission.permissions, ['marketing']);
  assert.equal(reads, 0);
});

test('live reminder CRM reports the total and at most 50 recent masked entries', async () => {
  const phone = '01011223344';
  const consentedAt = '2026-11-19T10:20:00Z';
  const latest = Array.from({length: 51}, () => ({phone, maskedPhone: '010-****-3344', consentedAt}));
  latest[1].maskedPhone = phone;
  const route = loadRoute({read: async () => ({count: 54, latest})});
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(route.permissions, ['marketing']);
  const text = await response.text();
  assert.ok(!text.includes(phone));
  const result = JSON.parse(text);
  assert.equal(result.count, 54);
  assert.deepEqual(result.preview, preview);
  assert.equal(result.latest.length, 50);
  assert.deepEqual(result.latest[0], {maskedPhone: '010-****-3344', consentedAt});
  assert.deepEqual(result.latest[1], {maskedPhone: '010-****-****', consentedAt});
});

test('live reminder CRM hides upstream read errors', async () => {
  const route = loadRoute({read: async () => { throw new Error('private upstream data'); }});
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.doesNotMatch(await response.text(), /private upstream data/);
});
