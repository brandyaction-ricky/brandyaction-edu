import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, name => {
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency ' + name);
  }, ...Object.values(globals));
  return exports;
}
function browser(cookie = '', { denied = false, ignored = false } = {}) {
  const cookies = new Map(cookie.split(';').filter(Boolean).map(x => x.trim().split('=')));
  const writes = [], scripts = [], calls = [];
  const document = {
    get cookie() { if (denied) throw Error('blocked'); return [...cookies].map(x => x.join('=')).join('; '); },
    set cookie(value) { writes.push(value); if (denied) throw Error('blocked'); if (!ignored) { const [name, content] = value.split(';')[0].split('='); cookies.set(name, content); } },
    createElement: () => ({}), head: { appendChild: value => scripts.push(value) },
  };
  const window = {};
  const globals = { document, window, location: { protocol: 'https:', search: '' } };
  const preferences = load('lib/ad-preferences.ts', {}, globals);
  const tracking = load('lib/landing-browser.ts', {
    './ad-preferences': preferences,
    './landing': { TEST_COOKIE: 'edu_landing_test', isTestRequest: value => value.split(';').some(x => x.trim() === 'edu_landing_test=1') },
    './landing-engagement': {},
  }, globals);
  return { preferences, tracking, document, window, writes, scripts, calls };
}
const config = { pixel_enabled: true, pixel_id: '1234567890' };

test('a saved opt-out prevents SDK loading, pixel initialization and all page/click events', () => {
  const b = browser('other=x; edu_noads=1');
  for (const event of ['PageView', 'Lead', 'CompleteRegistration']) b.tracking.pixel(config, event);
  assert.equal(b.scripts.length, 0);
  assert.equal(b.window.fbq, undefined);
  assert.equal(browser('edu_noads=10').preferences.adsRejected(), false);
});
test('reject drops queued events before a late SDK and saves a secure one-year browser choice', () => {
  const b = browser(); b.tracking.pixel(config, 'PageView');
  assert.ok(b.window.fbq.queue.some(x => x[0] === 'trackSingle'));
  assert.deepEqual(b.preferences.rejectPersonalizedAds(), { saved: true });
  assert.deepEqual(b.window.fbq.queue, [['consent', 'revoke']]);
  b.tracking.pixel(config, 'Lead');
  assert.deepEqual(b.window.fbq.queue, [['consent', 'revoke']]);
  assert.match(b.writes[0], /^edu_noads=1; Path=\/; Max-Age=31536000; SameSite=Lax; Secure$/);
  assert.equal(browser(b.document.cookie).preferences.adsRejected(), true);
});
test('reject revokes an already-loaded SDK and prevents subsequent events without deleting auth cookies', () => {
  const b = browser('sb-test-auth-token=keep; edu_landing_test=0');
  b.window.fbq = (...args) => b.calls.push(args);
  b.tracking.pixel(config, 'PageView');
  b.preferences.rejectPersonalizedAds();
  const after = b.calls.length;
  b.tracking.pixel(config, 'CompleteRegistration');
  assert.deepEqual(b.calls.at(-1), ['consent', 'revoke']);
  assert.equal(b.calls.length, after);
  assert.match(b.document.cookie, /sb-test-auth-token=keep/);
});
test('throwing or silently ignored cookie writes report failure but stop events in this page', () => {
  for (const options of [{ denied: true }, { ignored: true }]) {
    const b = browser('', options);
    assert.deepEqual(b.preferences.rejectPersonalizedAds(), { saved: false });
    assert.equal(b.preferences.adRejectionSaved(), false);
    b.tracking.pixel(config, 'PageView'); assert.equal(b.scripts.length, 0);
  }
});
test('the existing test mode remains effective and an opt-out never starts the SDK', () => {
  const b = browser('edu_landing_test=1');
  b.tracking.pixel(config, 'PageView'); assert.equal(b.scripts.length, 0);
});

const policies = load('lib/legal-policies.ts');
test('notice preparation retains the current consent version and N6 wording; the new document is upcoming', () => {
  assert.equal(policies.POLICY_VERSION, '2026-08-11');
  assert.equal(policies.UPCOMING_PRIVACY_VERSION, '2026-10-20');
  assert.equal(policies.ARCHIVED_PRIVACY_VERSION, '2026-08-11');
  assert.equal(policies.defaultPolicies.privacy, policies.archivedPrivacyPolicy);
  assert.match(policies.archivedPrivacyPolicy, /시행일: 2026년 8월 11일/);
  assert.doesNotMatch(policies.archivedPrivacyPolicy, /2026년 10월 20일/);
  assert.match(policies.defaultPolicies.privacy, /N6 진단 관련 추가 안내/);
  for (const copy of [policies.defaultPolicies.privacy, policies.upcomingPrivacyPolicy]) {
    assert.match(copy, /Anthropic, PBC/); assert.match(copy, /privacy@anthropic.com/);
    assert.match(copy, /진단 응답과 결과 보고서: 회원 탈퇴 시까지/);
  }
  assert.match(policies.upcomingPrivacyPolicy, /시행 예정일: 2026년 10월 20일/);
  assert.match(policies.upcomingPrivacyPolicy, /TypeSafe AI, Inc\.\(미국, privacy@typesafe.ai\)/);
  assert.doesNotMatch(policies.upcomingPrivacyPolicy, /〔|정식 법인명|\(연락처\)/);
  assert.deepEqual([...policies.upcomingPrivacyPolicy.matchAll(/^(\d+)\. /gm)].map(x => Number(x[1])), Array.from({ length: 17 }, (_, i) => i + 1));
});
test('the archived page keeps the original text after the active policy is replaced', () => {
  const jsx = (type, props) => ({ type, props });
  const { PrivacyPolicy } = load('app/ui/privacy-policy.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'link',
    '@/lib/legal-policies': { ...policies, POLICY_VERSION: '2026-10-20', defaultPolicies: { privacy: '새로 적용된 방침' } },
    './ad-preferences': {}, './privacy-policy.css': {},
  });
  const copy = node => {
    if (!node || typeof node !== 'object') return typeof node === 'string' ? node : '';
    if (Array.isArray(node)) return node.map(copy).join('\n');
    return copy(node.props?.children);
  };
  const current = copy(PrivacyPolicy({}));
  const archived = copy(PrivacyPolicy({ version: '2026-08-11' }));
  assert.match(current, /새로 적용된 방침/);
  assert.doesNotMatch(archived, /새로 적용된 방침/);
  assert.match(archived, /시행일: 2026년 8월 11일/);
  assert.match(archived, /N6 진단 관련 추가 안내 \(2026년 10월 4일\)/);
});
test('only the known policy versions route successfully; unknown versions and extra segments return 404', async () => {
  const route = load('app/[[...path]]/page.tsx', {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '@/lib/legal-policies': policies, '@/lib/edu-settings': {}, '@/lib/supabase/server': {},
    '@/app/ui/platform': { Platform: 'platform' },
    'next/navigation': { notFound: () => { throw Error('404'); } },
    '@/lib/landing-admin-state': {}, '@/lib/platform': { sections: [] },
    'next/headers': {}, '@/lib/product-sharing': {},
  });
  for (const path of [['policies', 'privacy'], ['policies', 'privacy', '2026-08-11'], ['policies', 'privacy', '2026-10-20'], ['policies', 'terms'], ['policies', 'refund']]) {
    assert.deepEqual((await route.default({ params: Promise.resolve({ path }) })).props.path, path);
  }
  for (const path of [['policies', 'privacy', '2027-01-01'], ['policies', 'terms', '2026-10-20'], ['policies', 'privacy', '2026-10-20', 'extra']]) {
    await assert.rejects(route.default({ params: Promise.resolve({ path }) }), /404/);
  }
});
