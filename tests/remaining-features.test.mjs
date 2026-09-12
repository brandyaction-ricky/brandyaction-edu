import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function source(path) {
  return fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
}
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(source(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => {
    if (!(name in dependencies)) throw Error(name);
    return dependencies[name];
  });
  return exports;
}

test("staff permissions default deny and map every admin section to a scope", () => {
  const permissions = load("lib/operator-scopes.ts");
  const workflows = source("app/api/platform/workflows/route.ts");
  assert.deepEqual(
    permissions.normalizeOperatorPermissions({
      products: true,
      orders: "true",
      unknown: true,
    }),
    {
      products: true,
      members: false,
      orders: false,
      content: false,
      marketing: false,
    },
  );
  for (const section of [
    "products",
    "customers",
    "orders",
    "articles",
    "campaigns",
  ])
    assert.ok(permissions.sectionScopes[section]);
  assert.match(workflows, /member\.data\.role === ['"]admin['"]/);
});

test("large uploads use signed direct storage and retain client-side limits", () => {
  const route = source("app/api/platform/upload/route.ts");
  const field = source("app/ui/editor-fields.tsx");
  assert.match(route, /createSignedUploadUrl/);
  assert.doesNotMatch(route, /request\.formData/);
  assert.match(route, /['"]detail-image['"]/);
  assert.match(route, /20 \* MB/);
  assert.match(field, /uploadToSignedUrl/);
  assert.match(field, /image \? 10 : 20/);
});

test("admin pagination follows each section primary table and scopes order relations", () => {
  const route = source("app/api/platform/route.ts");
  assert.match(route, /sections\.find\(\(section\) => section\.key === sectionKey\)\?\.table/);
  assert.match(route, /sectionKey === ['"]orders['"] \? 30 : 100/);
  assert.match(route, /deferredOrderTables/);
  assert.match(route, /\.in\(['"]order_id['"], orderIds\)/);
  assert.match(route, /\.in\(['"]payment_id['"], paymentIds\)/);
});

test("CRM delivery and scheduler are fail-closed without explicit secrets", () => {
  const delivery = source("lib/crm-delivery.ts");
  const cron = source("app/api/cron/crm/route.ts");
  assert.match(delivery, /CRM_DELIVERY_ENABLED !== ['"]true['"]/);
  assert.match(delivery, /marketing_consent === true/);
  assert.match(delivery, /limit\(501\)/);
  assert.match(source("app/api/platform/workflows/route.ts"), /['"]crm-save['"]/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /authorization/);
});
