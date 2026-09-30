import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/crm-purchase-contact.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contact = {};
new Function("exports", compiled)(contact);

function deliveryFor(order, filters) {
  const deliverySource = fs.readFileSync(new URL("../lib/crm-delivery.ts", import.meta.url), "utf8");
  const deliveryCompiled = ts.transpileModule(deliverySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const delivery = {};
  const query = {
    select() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    async maybeSingle() { return { data: order, error: null }; },
  };
  const dependencies = {
    solapi: { SolapiMessageService: class {} },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: (table) => {
      assert.equal(table, "orders");
      return query;
    } }) },
    "@/lib/crm-purchase-contact": contact,
    "@/lib/crm-purchase-email": { purchaseEmailConfigured: () => false },
    "@/lib/crm-sms-settings": { loadSmsSettings: async () => ({}) },
  };
  new Function("exports", "require", deliveryCompiled)(delivery, (name) => dependencies[name]);
  return delivery;
}

test("paid order contact takes precedence over an empty or stale profile", () => {
  assert.deepEqual(
    contact.purchaseContact(
      { customer_name: "주문자", customer_phone: "010-1234-5678", customer_email: "order@example.com" },
      { full_name: "가입자", phone: "01098765432", email: "profile@example.com" },
    ),
    { full_name: "주문자", phone: "01012345678", email: "order@example.com" },
  );
});

test("invalid order contact falls back to valid profile contact", () => {
  assert.deepEqual(
    contact.purchaseContact(
      { customer_phone: "123", customer_email: "invalid" },
      { full_name: "가입자", phone: "010-9876-5432", email: "profile@example.com" },
    ),
    { full_name: "가입자", phone: "01098765432", email: "profile@example.com" },
  );
});

test("purchase guide link stays on order history until the guide is enabled", () => {
  const orderId = "2d6493c3-8d42-43f3-bb14-a6804855232f";
  assert.equal(
    contact.purchaseGuideLink(orderId, { siteUrl: "https://brandyaction-edu-dev.vercel.app" }),
    "https://brandyaction-edu-dev.vercel.app/my/orders",
  );
  assert.equal(
    contact.purchaseGuideLink(orderId, { siteUrl: "https://brandyaction-edu.com", guideEnabled: true }),
    `https://brandyaction-edu.com/purchase-onboarding?order=${orderId}`,
  );
});

test("purchase automation reads only the paid order belonging to its member", async () => {
  const memberId = "b034f458-9a4b-4615-83b3-7f0d95ddab82";
  const orderId = "2d6493c3-8d42-43f3-bb14-a6804855232f";
  const filters = [];
  const delivery = deliveryFor({ id: orderId, status: "paid", customer_phone: "010-1234-5678" }, filters);
  const result = await delivery.paidOrderRecipient(
    { member_id: memberId, trigger_key: `purchase_completed:${orderId}` },
    { id: memberId, status: "active", phone: null },
  );
  assert.equal(result.phone, "01012345678");
  assert.deepEqual(filters, [["id", orderId], ["user_id", memberId]]);
});

test("purchase automation skips a no-longer-paid order", async () => {
  const memberId = "b034f458-9a4b-4615-83b3-7f0d95ddab82";
  const orderId = "2d6493c3-8d42-43f3-bb14-a6804855232f";
  const delivery = deliveryFor({ id: orderId, status: "cancelled", customer_phone: "010-1234-5678" }, []);
  assert.equal(await delivery.paidOrderRecipient(
    { member_id: memberId, trigger_key: `purchase_completed:${orderId}` },
    { id: memberId, status: "active" },
  ), null);
});


test("contact email normalizes a preference and rejects invalid recipients", () => {
  assert.equal(contact.contactEmail("  Notice+edu@Example.COM "), "notice+edu@example.com");
  for (const value of [null, "", "  "]) assert.equal(contact.contactEmail(value), null);
  for (const value of [undefined, 123, {}, "invalid", "a@b", "a@example.com,b@example.com", "a@example.com\r\nBcc: other@example.com", "x".repeat(250)+"@example.com"]) {
    assert.throws(() => contact.contactEmail(value), /이메일/);
  }
});

test("a new delivery preference overrides an existing paid order without changing its snapshot", async () => {
  const memberId = "b034f458-9a4b-4615-83b3-7f0d95ddab82";
  const orderId = "2d6493c3-8d42-43f3-bb14-a6804855232f";
  const order = { id: orderId, status: "paid", customer_email: "old-order@example.test" };
  const delivery = deliveryFor(order, []);
  const result = await delivery.paidOrderRecipient(
    { member_id: memberId, trigger_key: `purchase_completed:${orderId}` },
    { id: memberId, status: "active", email: "login@example.test", contact_email: "new-notice@example.test" },
  );
  assert.equal(result.email, "new-notice@example.test");
  assert.equal(order.customer_email, "old-order@example.test");
  for (const preference of [null, "", "invalid"]) {
    assert.equal(contact.purchaseContact(order, { email: "login@example.test", contact_email: preference }).email, "old-order@example.test");
  }
});
