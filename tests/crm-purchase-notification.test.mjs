import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function moduleFrom(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = {};
  new Function("exports", "require", compiled)(result, (name) => dependencies[name]);
  return result;
}

const email = moduleFrom("../lib/crm-purchase-email.ts");
const sms = moduleFrom("../lib/crm-sms-settings.ts", {
  "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("DB not needed"); } },
});

test("email fallback sends only name, email and approved order link", async () => {
  const prior = { key: process.env.RESEND_API_KEY, from: process.env.CRM_EMAIL_FROM, enabled: process.env.CRM_DELIVERY_ENABLED };
  process.env.RESEND_API_KEY = "test-key";
  process.env.CRM_EMAIL_FROM = "브랜디에듀 <noreply@mail.brandyaction-edu.com>";
  process.env.CRM_DELIVERY_ENABLED = "true";
  try {
    let payload;
    const id = await email.sendPurchaseEmail({
      email: "customer@example.com", name: "테스트", automationRunId: "run-1",
      purchaseLink: "https://brandyaction-edu-dev.vercel.app/my/orders",
    }, async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(options.headers["Idempotency-Key"], "edu-purchase-run-1");
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: "provider-1" }) };
    });
    assert.equal(id, "provider-1");
    assert.deepEqual(payload.to, ["customer@example.com"]);
    assert.match(payload.text, /테스트님/);
    assert.match(payload.text, /https:\/\/brandyaction-edu-dev.vercel.app\/my\/orders/);
    assert.doesNotMatch(JSON.stringify(payload), /010\d{8}|1,650,000|card/i);
  } finally {
    if (prior.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = prior.key;
    if (prior.from === undefined) delete process.env.CRM_EMAIL_FROM; else process.env.CRM_EMAIL_FROM = prior.from;
    if (prior.enabled === undefined) delete process.env.CRM_DELIVERY_ENABLED; else process.env.CRM_DELIVERY_ENABLED = prior.enabled;
  }
});

test("purchase email refuses external guide hosts", async () => {
  const old = process.env.CRM_DELIVERY_ENABLED;
  process.env.CRM_DELIVERY_ENABLED = "true";
  process.env.RESEND_API_KEY = "test-key";
  process.env.CRM_EMAIL_FROM = "noreply@mail.brandyaction-edu.com";
  await assert.rejects(() => email.sendPurchaseEmail({ email: "a@example.com", name: "a", automationRunId: "run", purchaseLink: "https://example.com/orders" }, async () => { throw new Error("must not send"); }), /사이트 주소/);
  if (old === undefined) delete process.env.CRM_DELIVERY_ENABLED; else process.env.CRM_DELIVERY_ENABLED = old;
  delete process.env.RESEND_API_KEY;
  delete process.env.CRM_EMAIL_FROM;
});

test("marketing text includes sender and free 080 opt-out", () => {
  assert.equal(sms.marketingText("신규 강의", "브랜디액션", "08012345678"),
    "(광고) 브랜디액션\n신규 강의\n무료수신거부 08012345678");
  assert.throws(() => sms.marketingText("신규 강의", "브랜디액션", "01012345678"), /080/);
});

test("admin SMS choices accept only registered sender and 080 opt-out numbers", () => {
  const oldSender = process.env.SOLAPI_SENDER_PHONE;
  const oldOptout = process.env.SOLAPI_OPTOUT_PHONE;
  process.env.SOLAPI_SENDER_PHONE = "0212345678";
  process.env.SOLAPI_OPTOUT_PHONE = "08012345678";
  try {
    const valid = { senderPhone: "02-1234-5678", optoutPhone: "080-1234-5678",
      senderName: "브랜디액션", transactionalEnabled: true, marketingEnabled: true };
    assert.equal(sms.validateSmsSettings(valid).senderPhone, "0212345678");
    assert.throws(() => sms.validateSmsSettings({ ...valid, senderPhone: "01099998888" }), /등록된 발신번호/);
    assert.throws(() => sms.validateSmsSettings({ ...valid, optoutPhone: "" }), /080/);
  } finally {
    if (oldSender === undefined) delete process.env.SOLAPI_SENDER_PHONE; else process.env.SOLAPI_SENDER_PHONE = oldSender;
    if (oldOptout === undefined) delete process.env.SOLAPI_OPTOUT_PHONE; else process.env.SOLAPI_OPTOUT_PHONE = oldOptout;
  }
});

test("marketing is blocked at night in Korea and resumes at 08:00", () => {
  assert.equal(sms.marketingAllowedNow(new Date("2026-09-27T11:59:59Z")), true);
  assert.equal(sms.marketingAllowedNow(new Date("2026-09-27T12:00:00Z")), false);
  assert.equal(sms.nextMarketingWindow(new Date("2026-09-27T12:00:00Z")), "2026-09-27T23:00:00.000Z");
  assert.equal(sms.nextMarketingWindow(new Date("2026-09-27T20:00:00Z")), "2026-09-27T23:00:00.000Z");
});
