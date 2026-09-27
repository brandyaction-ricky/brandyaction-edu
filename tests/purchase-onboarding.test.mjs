import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../lib/purchase-onboarding.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', compiled)(exports);
const { purchaseOnboardingSettings, surveyRoom, telegramPath, telegramInviteUrl } = exports;

test('Telegram link is withheld until a valid link is configured and the guide is enabled', () => {
  const draft = purchaseOnboardingSettings({ roomName: 'AI Moonshot project #4기', enabled: false });
  assert.equal(draft.inviteUrl, '');
  assert.throws(() => purchaseOnboardingSettings({ roomName: draft.roomName, enabled: true }), /초대 링크/);
  assert.equal(purchaseOnboardingSettings({ roomName: draft.roomName, inviteUrl: 'https://t.me/+ExampleCode123', enabled: true }).enabled, true);
  for (const bad of ['http://t.me/+ExampleCode123', 'https://t.me.evil.test/+ExampleCode123', 'https://t.me/+ExampleCode123?token=1', 'https://example.com']) {
    assert.throws(() => telegramInviteUrl(bad), /텔레그램/);
  }
});

test('survey and path values stay in their fixed allowlists', () => {
  assert.equal(surveyRoom('paid'), 'paid');
  assert.equal(surveyRoom('organic'), 'organic');
  assert.equal(surveyRoom('unknown'), 'unknown');
  assert.equal(surveyRoom('other'), null);
  assert.equal(telegramPath('existing'), 'existing');
  assert.equal(telegramPath('new'), 'new');
  assert.equal(telegramPath('external'), null);
  assert.throws(() => purchaseOnboardingSettings({ roomName: 'room', paidImage: 'https://example.com/photo.png', enabled: false }), /프로필 이미지/);
});
