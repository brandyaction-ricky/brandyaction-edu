import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeReplitCurriculum } from '../scripts/lib/replit-curriculum.mjs';
import { compareCurriculumSnapshots, inspectCurriculumSnapshot } from '../scripts/lib/curriculum-transfer.mjs';

const date = '2026-09-07T05:18:25.730343+00:00';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const image = 'data:image/png;base64,' + png;
function sample() {
  return {
    export_type: 'curriculum_only', source_project: 'production-live', exported_at: date,
    cohorts: [{ id: 1, name: '가상 기수', is_active: true, description: '', created_at: date }],
    days: [{ id: 1, title: '-', cohort_id: 1, day_number: 1, icon_url: null, created_at: date, updated_at: date,
      blocks: [
        { id: 'intro', order: 5, type: 'text', content: '첫 문단\n\n끝 공백  ' },
        { id: 'q1', order: 1, type: 'question', content: '', questionId: 'answer-1', questionType: 'text', questionLabel: '내 생각은?' },
        { id: 'pg', order: 9, type: 'prompt_generator', content: '{{나의 목표}}\n예시 원문', promptQuestions: ['나의 목표'], promptExamples: ['입력 예시'] },
        { id: 'image', order: 10, type: 'image', content: image },
        { id: 'quiz', order: 11, type: 'quiz', content: '{"questions":[{"id":"q2","text":"시험","options":["A","B"],"correctIndex":1}]}' },
      ], mission_checks: [{ id: 'check', label: '기록 완료', required: true }] }],
    learning_lessons: [{ id: 1, title: '개념 학습', day_number: 1, week: 1, tag: 'ai', tag_label: 'AI', time: '5분', intro: '안내', content: '학습 본문', tip: '힌트', quiz: [{ q: '질문?', opts: ['가', '나'], ans: 1 }], is_active: false, created_at: date, updated_at: date }],
    ongoing_challenges: [{ id: 2, type: 'weekly', title: '매주 반복', description: '30일 이후', is_active: true, created_at: date, updated_at: date, blocks: [{ id: 'body', type: 'text', order: 0, content: '계속하기' }], mission_checks: [] }],
    admin_settings: [{ id: 1, updatedAt: date, noticeBanner: null, activeCohortId: null, mvpBorderColor: '#ff0000', autoApproveThroughWeek: 0 }],
  };
}

test('preserves every authored block, raw array order, ids, whitespace, required checks and inactive lessons', () => {
  const source = sample(), original = structuredClone(source), snapshot = normalizeReplitCurriculum(source);
  assert.deepEqual(source, original);
  assert.deepEqual(snapshot.documents[0].blocks.map(b => b.payload), source.days[0].blocks);
  assert.deepEqual(snapshot.documents[0].checklist, [{ sourceId: 'check', text: '기록 완료', required: true }]);
  assert.equal(snapshot.documents[1].metadata.is_active, false);
  assert.deepEqual(snapshot.documents[1].blocks[1].payload.quiz, source.learning_lessons[0].quiz);
  assert.equal(snapshot.documents[2].track, 'ongoing');
  assert.equal(snapshot.documents[2].metadata.type, 'weekly');
  assert.equal(snapshot.capturedAt, date); // An old package is never re-stamped as today's live export.
  assert.deepEqual(snapshot.configuration, { cohorts: source.cohorts, adminSettings: source.admin_settings });
});

test('retains empty ongoing track and supports multiple cohorts with the same day position', () => {
  const source = sample(); source.ongoing_challenges = [];
  source.cohorts.push({ ...source.cohorts[0], id: 2 });
  source.days.push({ ...structuredClone(source.days[0]), id: 2, cohort_id: 2 });
  assert.equal(inspectCurriculumSnapshot(normalizeReplitCurriculum(source)).counts.challenge, 2);
});

test('checks embedded image bytes and conservatively leaves remote media unverified without fetching it', () => {
  const source = sample(); source.days[0].blocks.push({ id: 'video', type: 'video', order: 12, content: 'https://example.test/v?token=never-print-me' });
  const snapshot = normalizeReplitCurriculum(source), asset = snapshot.documents[0].blocks[3].assets[0];
  assert.equal(asset.sha256, createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex'));
  assert.equal(asset.bytes, Buffer.from(png, 'base64').length);
  const report = inspectCurriculumSnapshot(snapshot);
  assert.ok(report.issues.some(issue => issue.code === 'ASSET_UNVERIFIED'));
  assert.doesNotMatch(JSON.stringify(report), /never-print-me/);
});

test('settings changes and missing ongoing challenges are caught by the content comparison', () => {
  const source = normalizeReplitCurriculum(sample()), target = structuredClone(source);
  target.configuration.adminSettings[0].autoApproveThroughWeek = 6;
  target.documents.pop();
  const result = compareCurriculumSnapshots(source, target);
  assert.ok(result.mismatches.some(issue => issue.code === 'CONFIGURATION_CHANGED'));
  assert.ok(result.mismatches.some(issue => issue.code === 'DOCUMENT_MISSING'));
});

for (const [name, change] of [
  ['student table included', s => s.users = [{ password_hash: 'secret-marker' }]],
  ['unknown authoring field', s => s.days[0].blocks[0].futureFeature = true],
  ['private push key', s => s.admin_settings[0].vapidPrivateKey = 'secret-marker'],
  ['full database export', s => s.export_type = 'database_dump'],
  ['duplicate source rows', s => s.days.push(structuredClone(s.days[0]))],
  ['missing cohort', s => s.days[0].cohort_id = 99],
  ['quiz option out of range', s => s.learning_lessons[0].quiz[0].ans = 5],
  ['unknown interactive tool', s => s.days[0].blocks[0].type = 'future_tool'],
  ['invalid image encoding', s => s.days[0].blocks[3].content = image + '!'],
  ['fake image data', s => s.days[0].blocks[3].content = 'data:image/png;base64,' + Buffer.from('not png').toString('base64')],
]) test(`rejects ${name} rather than silently losing fields or importing personal data`, () => {
  const source = sample(); change(source);
  assert.throws(() => normalizeReplitCurriculum(source), error => {
    assert.match(error.message, /Invalid Replit export:/);
    assert.doesNotMatch(error.message, /secret-marker/);
    return true;
  });
});

test('CLI writes a private new snapshot and will not overwrite an existing source or output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'replit-import-test-'));
  try {
    const input = join(dir, 'export.json'), output = join(dir, 'snapshot.json');
    writeFileSync(input, JSON.stringify(sample()));
    const run = (...args) => spawnSync(process.execPath, ['scripts/prepare-replit-curriculum.mjs', ...args], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
    const first = run(input, output); assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).currentLiveContentVerified, false);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(output)).documents.length, 3);
    assert.equal(run(input, output).status, 2);
    assert.equal(run(input, input).status, 2);
    writeFileSync(input, '{"password":"secret-marker",');
    const broken = run(input); assert.equal(broken.status, 2);
    assert.doesNotMatch(broken.stdout + broken.stderr, /secret-marker/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
