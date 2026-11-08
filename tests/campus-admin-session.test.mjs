import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(file, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, key => { assert.ok(key in imports, key); return imports[key]; });
  return exports;
}
const oauth = load('lib/oauth-callback.ts');
const jsx = (type, props) => ({ type, props });
const react = { jsx, jsxs: jsx };
const nav = { redirect: dest => { throw Error(dest); }, notFound: () => { throw Error('404'); } };

test('both admin entry pages reuse the verified session and apply their own menu scope', async () => {
  let current, reads = 0, fail = false;
  const permissions = load('lib/operator-permissions.ts', {
    '@/lib/supabase/admin': { createAdminClient() {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { value: current.grants } }) };
      return { from: () => chain };
    } },
    '@/lib/server-auth': {}, '@/lib/operator-scopes': load('lib/operator-scopes.ts'),
  });
  const access = load('features/campus/admin-page-access.tsx', {
    'react/jsx-runtime': react, 'next/link': {}, 'next/navigation': nav,
    '@/lib/server-auth': { getAuthenticatedUser() { reads++; if (fail) throw Error('session unavailable'); return current; } },
    '@/lib/operator-permissions': permissions,
  });
  const flag = process.env.EDU_CAMPUS_ENABLED;
  process.env.EDU_CAMPUS_ENABLED = 'true';
  try {
    for (const [path, component, module, scope, alternate] of [
      ['/admin/campus', 'AdminLive', '@/features/campus/ui/live', 'members', 'marketing'],
      ['/admin/campus/webinars', 'WebinarAdmin', '@/features/campus/webinar/admin', 'marketing', 'members'],
    ]) {
      const page = load('app' + path + '/page.tsx', { 'react/jsx-runtime': react, 'next/navigation': nav,
        '@/features/campus/admin-page-access': access, [module]: { [component]: component } }).default;
      const render = () => page({ searchParams: Promise.resolve({ filter: ['a', 'b'] }) });
      current = null;
      await assert.rejects(render(), e => new URL(e.message, 'https://example.test').searchParams.get('next') === path + '?filter=a&filter=b');
      for (const [role, grants, allowed] of [['admin', {}, true], ['staff', { [scope]: true }, true], ['staff', { [alternate]: true }, false], ['student', {}, false]]) {
        current = { id: 'qa', role, grants };
        const before = reads;
        const result = await render();
        assert.equal(reads - before, 1);
        assert.equal(result.type, allowed ? component : access.CampusAdminDenied);
      }
      fail = true; await assert.rejects(render(), /session unavailable/); fail = false;
    }
  } finally { if (flag === undefined) delete process.env.EDU_CAMPUS_ENABLED; else process.env.EDU_CAMPUS_ENABLED = flag; }
});

test('OAuth fallback restores only a known campus destination with a valid callback', () => {
  const callback = { pathname: '/', code: '1234567890123456', cookieNames: ['sb-dev-auth-token-code-verifier'] };
  for (const path of ['/admin/campus', '/admin/campus/webinars?show=recent']) {
    const dest = oauth.oauthCallbackRecoveryPath({ ...callback, campusReturn: path });
    assert.equal(new URL(dest, 'https://example.test').searchParams.get('next'), path);
  }
  for (const dest of ['//elsewhere.example', '/admin/users', '/api/admin/campus', '/admin/campus/../users']) {
    assert.equal(oauth.campusLoginReturn(dest), null);
  }
});
