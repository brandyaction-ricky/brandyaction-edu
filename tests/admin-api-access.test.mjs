import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function source(path, stubs, cache = new Map()) {
  if (cache.has(path)) return cache.get(path);
  const raw = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} }; cache.set(path, compiled.exports);
  new Function("require", "module", "exports", code)((id) => {
    if (id in stubs) return stubs[id];
    if (id.startsWith("@/")) return source(`${id.slice(2)}.ts`, stubs, cache);
    if (id.startsWith(".")) return source(`${path.slice(0, path.lastIndexOf("/"))}/${id.replace(/^\.\//, "")}.ts`, stubs, cache);
    return require(id);
  }, compiled, compiled.exports);
  return compiled.exports;
}
const courseId = "11111111-1111-4111-8111-111111111111";
const lessonId = "22222222-2222-4222-8222-222222222222";
function fixture(options = {}) {
  const calls = [];
  const lesson = { id: lessonId, content_type: "material", access_mode: "member", lesson_contents: { resource_name: "QA.pdf", resource_storage_path: `${courseId}/resource/qa.pdf` }, curriculum_weeks: { course_id: courseId, is_published: true, courses: { status: "published", list_price: 0, metadata: {} } }, ...options.lesson };
  const responses = { profiles: { data: { status: "active" } }, curriculum_lessons: { data: lesson }, enrollments: { data: { id: "enrollment" } }, ...options.responses };
  const admin = {
    from(table) {
      const builder = {};
      for (const method of ["select", "eq", "lte", "or", "limit", "order"]) builder[method] = (...args) => { calls.push([table, method, ...args]); return builder; };
      builder.maybeSingle = async () => responses[table] || { data: null };
      builder.upsert = async () => { calls.push([table, "upsert"]); return options.claimError ? { error: { code: "503" } } : { error: null }; };
      return builder;
    },
    storage: { from(bucket) { return { async createSignedUrl(path, ttl, settings) { calls.push(["signed", bucket, path, ttl, settings]); return { data: { signedUrl: "https://storage.example/qa.pdf?download=QA.pdf" } }; } }; } },
  };
  const stubs = {
    "@/lib/server-auth": { getAuthenticatedUser: async () => options.anonymous ? null : { id: "student" }, getAdminUser: async () => options.operator || null },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/learning-data": { safeEmbedUrl: () => null },
    "next/cache": { revalidatePath() {} },
    "next/server": { NextResponse: { json(value, init = {}) { return new Response(JSON.stringify(value), { ...init, headers: { "Content-Type": "application/json", ...init.headers } }); } } },
  };
  return { calls, route: source("app/api/resources/claim/route.ts", stubs), stubs };
}
const claimRequest = () => new Request("https://example.com/api/resources/claim", { method: "POST", body: JSON.stringify({ lessonId }) });

test("anonymous resource claim cannot reach storage", async () => { const f = fixture({ anonymous: true }); assert.equal((await f.route.POST(claimRequest())).status, 401); assert.equal(f.calls.length, 0); });
test("suspended profile cannot claim even member resources", async () => { const f = fixture({ responses: { profiles: { data: { status: "suspended" } } } }); assert.equal((await f.route.POST(claimRequest())).status, 403); assert.ok(!f.calls.some((row) => row[0] === "signed")); });
test("private content is checked at all publication levels", async () => { const f = fixture({ responses: { curriculum_lessons: { data: null } } }); assert.equal((await f.route.POST(claimRequest())).status, 404); for (const field of ["is_published", "curriculum_weeks.is_published", "curriculum_weeks.courses.status"]) assert.ok(f.calls.some((row) => row[0] === "curriculum_lessons" && row[1] === "eq" && row[2] === field)); });
test("paid enrolled material cannot use the free claim path", async () => { const f = fixture({ lesson: { access_mode: "enrolled", curriculum_weeks: { course_id: courseId, courses: { list_price: 10000, metadata: {} } } } }); assert.equal((await f.route.POST(claimRequest())).status, 403); assert.ok(!f.calls.some((row) => row[0] === "signed")); });
test("free enrolled material asks for registration without signing a URL", async () => { const f = fixture({ lesson: { access_mode: "enrolled" }, responses: { enrollments: { data: null } } }); const response = await f.route.POST(claimRequest()); assert.equal(response.status, 403); assert.equal((await response.json()).code, "enrollment_required"); assert.ok(!f.calls.some((row) => row[0] === "signed")); });
test("free enrollment download checks ownership, active status and expiry", async () => { const f = fixture({ lesson: { access_mode: "enrolled" } }); assert.equal((await f.route.POST(claimRequest())).status, 200); assert.ok(f.calls.some((row) => row[0] === "enrollments" && row[2] === "user_id" && row[3] === "student")); assert.ok(f.calls.some((row) => row[0] === "enrollments" && row[2] === "status" && row[3] === "active")); assert.ok(f.calls.some((row) => row[0] === "enrollments" && row[1] === "or" && row[2].includes("access_ends_at.gt."))); });
test("member resource download uses short-lived attachment and no-store response", async () => { const f = fixture(); const response = await f.route.POST(claimRequest()); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store"); const signed = f.calls.find((row) => row[0] === "signed"); assert.equal(signed[3], 300); assert.deepEqual(signed[4], { download: "QA.pdf" }); assert.ok(f.calls.some((row) => row[0] === "course_content_claims")); });
test("foreign course file paths cannot be signed", async () => { const f = fixture({ lesson: { lesson_contents: { resource_storage_path: "other/course/file.pdf" } } }); assert.equal((await f.route.POST(claimRequest())).status, 409); assert.ok(!f.calls.some((row) => row[0] === "signed")); });
test("claim persistence failure does not disclose the signed link", async () => { const f = fixture({ claimError: true }); const response = await f.route.POST(claimRequest()); assert.equal(response.status, 503); assert.equal((await response.json()).content, undefined); });
for (const feature of ["missions", "groups", "participants", "seo"]) test(`${feature} API denies requests without scoped operator access`, async () => {
  const f = fixture(); const route = source(`app/api/admin/${feature}/route.ts`, f.stubs);
  for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
    if (!route[method]) continue;
    const result = await route[method](new Request(`https://example.com/api/admin/${feature}`, { method }));
    assert.equal(result.status, 403);
  }
  assert.equal(f.calls.length, 0);
});
