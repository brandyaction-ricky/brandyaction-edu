import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(
  new URL("../lib/oauth-callback.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const compiledModule = { exports: {} };
new Function("exports", compiled)(compiledModule.exports);
const { oauthCallbackRecoveryPath } = compiledModule.exports;

function callbackHarness({ metadata = { terms_version: '2026', privacy_version: '2026' } } = {}) {
  const source = fs.readFileSync(
    new URL('../app/auth/callback/route.ts', import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  const cookieMutations = [
    { name: 'sb-project-auth-token', value: 'base64-session', options: { path: '/', sameSite: 'lax' } },
    { name: 'sb-project-auth-token-code-verifier', value: '', options: { path: '/', maxAge: 0 } },
  ];
  const require = name => {
    if (name === '@/lib/platform') return { safeNext: value => value?.startsWith('/') && !value.startsWith('//') ? value : '/my' };
    if (name === '@/lib/supabase/server') return {
      createClient: async onCookies => ({
        auth: {
          async exchangeCodeForSession() {
            onCookies(cookieMutations);
            return { data: { session: { provider_token: 'provider-token' } }, error: null };
          },
          async getUser() {
            return { data: { user: { id: 'member-1', user_metadata: metadata } } };
          },
        },
      }),
    };
    if (name === '@/lib/kakao-sync-server') return { syncKakaoConsent: async () => false };
    if (name === 'next/server') return {
      NextResponse: {
        redirect(url) {
          const values = [];
          return {
            status: 307,
            redirectUrl: String(url),
            cookies: { set: (cookieName, value, options) => values.push({ name: cookieName, value, options }), values },
          };
        },
      },
    };
    throw new Error(`unexpected import: ${name}`);
  };
  new Function('exports', 'require', compiled)(exports, require);
  return { get: exports.GET, cookieMutations };
}

test("recovers a Supabase PKCE callback sent to the production site root", () => {
  const path = oauthCallbackRecoveryPath({
    pathname: "/",
    code: "015bc889-bec6-4abd-b920-827370ec2605",
    cookieNames: ["sb-qitqxizuwmmlhlcgsrqe-auth-token-code-verifier"],
  });

  assert.equal(
    path,
    "/auth/callback?code=015bc889-bec6-4abd-b920-827370ec2605&next=%2Fmy",
  );
});

test("does not intercept unrelated homepage code parameters", () => {
  const input = {
    pathname: "/",
    code: "PROMOTION-CODE-1234",
    cookieNames: [],
  };
  assert.equal(oauthCallbackRecoveryPath(input), null);
  assert.equal(
    oauthCallbackRecoveryPath({
      ...input,
      pathname: "/classes",
      cookieNames: ["sb-project-auth-token-code-verifier"],
    }),
    null,
  );
  assert.equal(
    oauthCallbackRecoveryPath({
      ...input,
      code: "<script>alert(1)</script>",
      cookieNames: ["sb-project-auth-token-code-verifier"],
    }),
    null,
  );
});

test('OAuth callback copies every Supabase session cookie onto the final redirect', async () => {
  const harness = callbackHarness();
  const response = await harness.get(new Request('https://edu.example/auth/callback?code=oauth-code&next=%2Fmy'));

  assert.equal(response.status, 307);
  assert.equal(response.redirectUrl, 'https://edu.example/my');
  assert.deepEqual(response.cookies.values, harness.cookieMutations);
});

test('consent redirect also preserves the Supabase session cookies', async () => {
  const harness = callbackHarness({ metadata: {} });
  const response = await harness.get(new Request('https://edu.example/auth/callback?code=oauth-code&next=%2Fmy'));

  assert.equal(response.redirectUrl, 'https://edu.example/auth/consent?next=%2Fmy');
  assert.deepEqual(response.cookies.values, harness.cookieMutations);
});
