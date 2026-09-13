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
