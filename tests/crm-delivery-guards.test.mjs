import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const member = {
  id: '11111111-1111-4111-8111-111111111111',
  phone: '01012345678', status: 'active', marketing_consent: true,
  marketing_consent_at: '2026-01-01T00:00:00.000Z', marketing_opt_out_at: null,
};

function dispatchFixture({ channel = 'lms', current = member, blackPages = [{ blackList: [], nextKey: null }], blackError = false } = {}) {
  const steps = [];
  const updates = [];
  const sentMessages = [];
  const template = { id: 'template', channel, purpose: 'marketing', content: '모집 안내' };
  const campaign = { id: 'campaign', recruitment_id: 'recruitment', template };
  let blackPage = 0;
  const db = {
    rpc: async () => {
      steps.push('claim');
      return { data: { template, members: [member] }, error: null };
    },
    from: (table) => {
      let operation = 'read';
      let values;
      let scoped = false;
      const query = {
        select: () => query,
        eq: () => query,
        lte: () => query,
        order: () => query,
        limit: () => query,
        in: (column, ids) => {
          if (table === 'profiles') {
            assert.equal(column, 'id');
            assert.deepEqual(ids, [member.id]);
            scoped = true;
          }
          return query;
        },
        insert: (rows) => { operation = 'insert'; values = rows; steps.push('log'); return query; },
        update: (value) => { operation = 'update'; updates.push({ table, value }); return query; },
        maybeSingle: async () => ({ data: table === 'crm_campaigns' ? operation === 'update' ? { id: campaign.id } : campaign : null, error: null }),
        then: (resolve, reject) => Promise.resolve(
          table === 'profiles' ? { data: scoped && current ? [current] : [], error: null }
            : table === 'crm_message_logs' && operation === 'insert' ? { data: values.map((row, index) => ({ id: `log${index}`, member_id: row.member_id })), error: null }
              : { data: null, error: null },
        ).then(resolve, reject),
      };
      return query;
    },
  };
  const modules = {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    solapi: { SolapiMessageService: class {
      async getBlacks() {
        steps.push('080');
        if (blackError) throw Error('private upstream detail');
        return blackPages[blackPage++] || { blackList: [], nextKey: null };
      }
      async send(messages) {
        steps.push('send');
        sentMessages.push(...messages);
        return { groupInfo: { groupId: 'qa', status: 'accepted' }, failedMessageList: [] };
      }
    } },
  };
  const exports = {};
  new Function('exports', 'require', 'process', ts.transpileModule(
    fs.readFileSync(new URL('../lib/crm-delivery.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText)(exports, name => modules[name], { env: {
    CRM_DELIVERY_ENABLED: 'true', CRM_AUTOMATIONS_ENABLED: 'false',
    EDU_CONVERSION_REVIEW_ENABLED: 'true', SOLAPI_API_KEY: 'test', SOLAPI_API_SECRET: 'test',
    SOLAPI_SENDER_PHONE: '0200000000', SOLAPI_OPTOUT_PHONE: '0800000000',
    SOLAPI_KAKAO_PF_ID: 'pf',
  } });
  return { dispatch: exports.dispatchDueCrm, steps, updates, sentMessages };
}

test('marketing delivery rechecks current consent after recruitment claim', async () => {
  const qa = dispatchFixture({ current: { ...member, marketing_opt_out_at: '2026-02-01T00:00:00.000Z' } });
  const result = await qa.dispatch();
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(qa.steps, ['claim']);
});

test('marketing delivery respects paginated 080 opt-outs before sending', async () => {
  const qa = dispatchFixture({ blackPages: [
    { blackList: [], nextKey: 'page-2' },
    { blackList: [{ recipientNumber: member.phone }], nextKey: null },
  ] });
  const result = await qa.dispatch();
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(qa.steps, ['claim', '080', '080']);
});

test('080 lookup errors stop delivery without disclosing provider details', async () => {
  const qa = dispatchFixture({ blackError: true });
  await qa.dispatch();
  assert.deepEqual(qa.steps, ['claim', '080']);
  assert.ok(qa.updates.some(row => row.table === 'crm_campaigns' && row.value.status === 'failed'));
  assert.doesNotMatch(JSON.stringify(qa.updates), /private upstream detail/);
});

test('marketing Alimtalk is rejected before claiming recipients', async () => {
  const qa = dispatchFixture({ channel: 'alimtalk' });
  await qa.dispatch();
  assert.deepEqual(qa.steps, []);
  assert.ok(qa.updates.some(row => row.table === 'crm_campaigns' && row.value.status === 'failed'));
});

test('consented and unblocked marketing SMS can be submitted with ad and opt-out labels', async () => {
  const qa = dispatchFixture();
  const result = await qa.dispatch();
  assert.equal(result.sent, 1);
  assert.deepEqual(qa.steps, ['claim', '080', 'log', 'send']);
  assert.match(qa.sentMessages[0].text, /^\(광고\)/);
  assert.match(qa.sentMessages[0].text, /무료수신거부/);
});
