import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('../features/campus/ui/progress-card.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const { progressCardSvg } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const mission = (id, status, required = true) => ({ id, title: `미션 ${id}`, version: '1', required, status, href: `/mission/${id}` });
function snapshot() {
  return {
    schemaVersion: 1, fetchedAt: '2026-11-02T15:10:00Z',
    viewer: { id: 'viewer-private-id', displayName: '문샷 동료', email: 'private@example.test', phone: '010-9999-8888', secret: 'server-secret-never-export' },
    scopes: [{ enrollmentId: 'enrollment-private-id', courseId: 'course-private-id', cohortId: 'cohort-private-id', courseTitle: '문샷 챌린지', cohortName: '3기' }],
    selectedEnrollmentId: 'enrollment-private-id',
    lessons: [
      { id: 'lesson1', title: '수업', day: 1, version: '1', completed: true, href: '/learn/lesson1', missions: [mission('m1', 'approved'), mission('m2', 'approved', false)] },
      { id: 'lesson2', title: '수업', day: 2, version: '1', completed: true, href: '/learn/lesson2', missions: [mission('m3', 'approved'), mission('m4', 'submitted')] },
      { id: 'lesson3', title: '수업', day: 3, version: '1', completed: false, href: '/learn/lesson3', missions: [mission('m5', 'changes_requested')] },
    ],
    links: { classes: '/my/classes', questions: '/my/questions' }, launchEligibility: null,
    customerData: { privateNotes: 'PRIVATE-CUSTOMER-NOTE' },
  };
}

test('hostile name is rendered as escaped text, never SVG script markup', () => {
  const input = snapshot(); input.viewer.displayName = '<script>x</script>';
  const svg = progressCardSvg(input);
  assert.match(svg, /&lt;script&gt;x&lt;\/script&gt;님의 실행 기록/);
  assert.doesNotMatch(svg, /<script\b/i);
  assert.doesNotMatch(svg, /<foreignObject\b/i);
});

test('course and cohort strings escape XML delimiters and both quote types', () => {
  const input = snapshot();
  input.scopes[0].courseTitle = '<image onload="x">&';
  input.scopes[0].cohortName = "'QA'<b>";
  const svg = progressCardSvg(input);
  assert.match(svg, /&lt;image onload=&quot;x&quot;&gt;&amp; · &apos;QA&apos;&lt;b&gt;/);
  assert.doesNotMatch(svg, /<image\b|<b>/i);
  assert.doesNotMatch(svg, /\bonload="x"/);
});

test('only requested display fields and counts are exported, not identity or other private fields', () => {
  const svg = progressCardSvg(snapshot());
  for (const privateValue of ['private@example.test', '010-9999-8888', 'server-secret-never-export', 'viewer-private-id', 'enrollment-private-id', 'course-private-id', 'cohort-private-id', 'PRIVATE-CUSTOMER-NOTE']) {
    assert.ok(!svg.includes(privateValue), privateValue);
  }
  assert.match(svg, /문샷 동료님의 실행 기록/);
  assert.match(svg, /문샷 챌린지 · 3기/);
});

test('demo export has a visible watermark while real export retains the scope disclaimers only', () => {
  const demo = progressCardSvg(snapshot(), true), real = progressCardSvg(snapshot());
  assert.match(demo, /가상 예시 · 검수용/);
  assert.ok(!real.includes('가상 예시 · 검수용'));
  for (const svg of [demo, real]) {
    assert.match(svg, /개인 학습 기록/);
    assert.match(svg, /수료증\/사업 성과 인증서가 아닙니다/);
    assert.match(svg, /현재 공개된 수업·과제 기준/);
  }
});

test('export uses current lesson and required-mission denominators, excluding optional approvals', () => {
  const svg = progressCardSvg(snapshot());
  assert.match(svg, /완료한 수업  2 \/ 3/);
  assert.match(svg, /승인된 필수 과제  2 \/ 4/);
  assert.match(svg, /피드백 대기 1개 · 수정 필요 1개/);
});

test('card records KST as-of date and makes no invented revenue, XP or study-time claim', () => {
  const svg = progressCardSvg(snapshot());
  assert.match(svg, /2026\. 11\. 3\./);
  assert.match(svg, /KST/);
  assert.match(svg, /실제 교육 효과나 매출 증가를 증명하지 않습니다/);
  assert.doesNotMatch(svg, /XP|\d+원|공부 시간|집중 시간|수익률/);
});

test('empty curriculum exports zero denominators without a fake percentage', () => {
  const input = snapshot(); input.lessons = [];
  const svg = progressCardSvg(input);
  assert.match(svg, /완료한 수업  0 \/ 0/);
  assert.match(svg, /승인된 필수 과제  0 \/ 0/);
  assert.doesNotMatch(svg, /100%|NaN|Infinity/);
});
