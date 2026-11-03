import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';

function load(file, deps, env, fetch) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'process', 'fetch', code)(exports, name => deps[name], { env }, fetch);
  return exports;
}

for (const channel of ['sms', 'alimtalk', 'email']) {
  test(`scheduled ${channel} uses only buyers who are still eligible and is dispatched once`, async () => {
    const member = { id: 'buyer', full_name: '가상 구매자', status: 'active', role: 'member', phone: '01000000001', email: 'buyer@example.test' };
    const template = { id: 'template', name: 'QA', channel, purpose: 'transactional', content: '공지', is_active: true, alimtalk_template_id: 'approved' };
    const batch = { id: 'batch', cohort_id: 'cohort', channel, created_by: 'operator', recipient_ids: ['buyer', 'refund'],
      template_id: template.id, subject: '공지', content: '공지', status: 'scheduled' };
    const calls = [];
    const receipts = [];
    const db = { from(table) {
      let update;
      const filters = {};
      const q = {
        select: () => q, in: () => q, lte: () => q, lt: () => q, order: () => q, limit: () => q,
        range: () => q, is: () => q, or: () => q, gt: () => q,
        eq: (key, value) => { filters[key] = value; return q; },
        update: values => { update = values; return q; },
        insert: async values => { receipts.push(...values); return {}; },
        maybeSingle: async () => {
          if (table === 'profiles') return { data: { id: 'operator', role: 'admin', status: 'active' } };
          if (filters.status !== batch.status) return { data: null };
          if (update) Object.assign(batch, update);
          return { data: { ...batch } };
        },
        then(resolve, reject) {
          if (table === 'enrollments') {
            assert.equal(filters.cohort_id, 'cohort');
            assert.equal(filters['order_items.orders.status'], 'paid');
            return Promise.resolve({ data: [
              { profiles: member, order_items: { orders: { user_id: member.id } } },
              { profiles: { ...member, id: 'outside', email: 'outside@example.test', phone: '01000000002' }, order_items: { orders: { user_id: 'outside' } } },
            ] }).then(resolve, reject);
          }
          if (table === 'crm_templates') return Promise.resolve({ data: [template] }).then(resolve, reject);
          if (table === 'edu_purchase_delivery_batches' && filters.id === batch.id && filters.status === batch.status) Object.assign(batch, update);
          if (table === 'crm_message_logs' && update) receipts.forEach(row => Object.assign(row, update));
          return Promise.resolve({}).then(resolve, reject);
        },
      };
      return q;
    } };
    const result = load('../lib/purchase-buyer-delivery-server.ts', {
      'node:crypto': { createHash },
      '@/lib/supabase/admin': { createAdminClient: () => db },
      '@/lib/crm-sms-settings': { loadSmsSettings: async () => ({ transactionalEnabled: true, senderPhone: '0200000000' }) },
      '@/lib/crm-purchase-email': { purchaseEmailConfigured: () => true, maskEmail: () => 'masked' },
      '@/lib/crm-delivery': { sendBatch: async (selected, members, scope) => {
        calls.push(members.map(row => row.id));
        assert.equal(selected.channel, channel);
        assert.equal(scope.purchaseBatchId, batch.id);
        return { sent: 1, failed: 0 };
      } },
      '@/lib/operator-permissions': { permissionsFor: async () => ({ products: true, orders: true, marketing: true }) },
      '@/lib/purchase-buyer-delivery': load('../lib/purchase-buyer-delivery.ts', {}),
    }, { CRM_DELIVERY_ENABLED: 'true', SOLAPI_API_KEY: 'mock', SOLAPI_API_SECRET: 'mock', SOLAPI_KAKAO_PF_ID: 'mock' },
    async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails/batch');
      assert.equal(options.headers['Idempotency-Key'], 'edu-buyer-batch');
      calls.push(JSON.parse(options.body).map(row => row.to));
      return Response.json({ data: [{ id: 'mock-receipt' }] });
    });
    batch.template_hash = result.purchaseTemplateHash(template);
    await result.dispatchPurchaseBuyerDelivery();
    await result.dispatchPurchaseBuyerDelivery();
    assert.deepEqual(calls, channel === 'email' ? [[['buyer@example.test']]] : [['buyer']]);
    assert.equal(batch.status, 'completed');
    assert.equal(batch.accepted_count, 1);
    assert.equal(batch.skipped_count, 1);
    if (channel === 'email') assert.equal(receipts[0].status, 'accepted');
  });
}
