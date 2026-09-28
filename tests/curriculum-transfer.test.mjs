import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BLOCK_TYPES, inspectCurriculumSnapshot, compareCurriculumSnapshots } from '../scripts/lib/curriculum-transfer.mjs';

const copy = value => structuredClone(value);
const block = (sourceId, type = 'text', payload = { text: '원문\n\n두 번째 줄  ' }) => ({ sourceId, type, payload, assets: [] });
const doc = (sourceId, track = 'challenge', day = 1) => ({ track, sourceId, week: 1, day, title: '학습 제목', metadata: { published: true, intro: '안내', tip: '힌트' }, blocks: [block('body'), block('prompt', 'prompt-generator', { fields: [{ id: 'brand', label: '브랜드명', placeholder: '예시' }], template: '{brand}를 위한\n프롬프트' })], checklist: [{ sourceId: 'task', text: '완료 확인', required: true }] });
const sample = () => ({ formatVersion: 1, origin: 'synthetic', capturedAt: '2026-09-28T13:00:00Z', documents: [doc('day-1'), doc('day-1', 'learning')] });
const options = { supportedBlockTypes: ['text', 'prompt-generator'], expectedDocumentCounts: { challenge: 1, learning: 1 } };

test('content comparison keeps challenge and theory tracks distinct, including matching day/source ids', () => {
  const input = sample(), before = copy(input), target = copy(input);
  target.origin = 'edu'; target.capturedAt = '2026-09-28T14:00:00Z';
  const result = compareCurriculumSnapshots(input, target, options);
  assert.equal(result.contentTransferReady, true);
  assert.equal(result.sourceCounts.documents, 2);
  assert.equal(result.sourceCounts.blocks, 4);
  assert.deepEqual(input, before);
});

test('preserves placeholder titles and real content instead of treating days 26–30 as empty', () => {
  const input = sample(); input.documents[0].title = '-'; input.documents[0].day = 26;
  const result = compareCurriculumSnapshots(input, copy(input), options);
  assert.equal(result.contentTransferReady, true);
  assert.equal(result.sourceCounts.blocks, 4);
  assert.ok(result.issues.some(item => item.code === 'TITLE_PLACEHOLDER'));
});

test('key order is irrelevant, but line breaks, spaces and variable names are exact', () => {
  const input = sample(), target = copy(input);
  target.documents[0].metadata = { tip: '힌트', intro: '안내', published: true };
  assert.equal(compareCurriculumSnapshots(input, target, options).contentMatches, true);
  target.documents[0].blocks[0].payload.text = target.documents[0].blocks[0].payload.text.trim();
  assert.equal(compareCurriculumSnapshots(input, target, options).contentMatches, false);
});

for (const [name, change, code] of [
  ['deleted lesson', target => target.documents.pop(), 'DOCUMENT_MISSING'],
  ['reordered lessons', target => target.documents.reverse(), 'DOCUMENT_ORDER_OR_MEMBERSHIP_CHANGED'],
  ['moved day', target => target.documents[0].day++, 'POSITION_CHANGED'],
  ['changed title', target => target.documents[0].title = '다른 제목', 'TITLE_CHANGED'],
  ['lost introduction', target => delete target.documents[0].metadata.intro, 'METADATA_CHANGED'],
  ['reordered blocks', target => target.documents[0].blocks.reverse(), 'BLOCK_ORDER_OR_MEMBERSHIP_CHANGED'],
  ['lost question', target => target.documents[0].blocks.pop(), 'BLOCK_ORDER_OR_MEMBERSHIP_CHANGED'],
  ['changed template', target => target.documents[0].blocks[1].payload.template = '{company}', 'BLOCK_CONTENT_CHANGED'],
  ['changed required task', target => target.documents[0].checklist[0].required = false, 'CHECKLIST_CHANGED'],
]) test(`rejects migration with ${name}`, () => {
  const source = sample(), target = copy(source); change(target);
  const result = compareCurriculumSnapshots(source, target, options);
  assert.equal(result.contentTransferReady, false);
  assert.ok(result.mismatches.some(item => item.code === code), code);
});

test('quiz answer and option changes are detected, including multiple quizzes in one lesson', () => {
  const source = sample();
  source.documents[0].blocks = Array.from({ length: 6 }, (_, i) => block('quiz-' + i, 'quiz', { questions: [{ prompt: '문제', options: ['A', 'B'], correctIndex: 1 }] }));
  const target = copy(source);
  assert.equal(inspectCurriculumSnapshot(source).counts.blockTypes.quiz, 6);
  target.documents[0].blocks[4].payload.questions[0].correctIndex = 0;
  assert.ok(compareCurriculumSnapshots(source, target).mismatches.some(item => item.block === 'quiz-4'));
  const target2 = copy(source); target2.documents[0].blocks[2].payload.questions[0].options.reverse();
  assert.equal(compareCurriculumSnapshots(source, target2).contentMatches, false);
});

test('all 17 block types are inventoried, but undeclared renderer support never passes readiness', () => {
  const source = sample(); source.documents[0].blocks = BLOCK_TYPES.map(type => block(type, type));
  const unverified = compareCurriculumSnapshots(source, copy(source));
  assert.equal(unverified.contentMatches, true);
  assert.equal(unverified.contentTransferReady, false);
  assert.equal(Object.keys(unverified.sourceCounts.blockTypes).length, 17);
});

test('media bytes must be verified, even when both snapshots carry the same URL placeholder', () => {
  const source = sample();
  source.documents[0].blocks[0].assets = [{ sourceId: 'image-1', sha256: null, bytes: null, mimeType: 'image/png' }];
  assert.equal(compareCurriculumSnapshots(source, copy(source), options).contentTransferReady, false);
  source.documents[0].blocks[0].assets[0].sha256 = 'a'.repeat(64);
  source.documents[0].blocks[0].assets[0].bytes = 2048;
  assert.equal(compareCurriculumSnapshots(source, copy(source), options).contentTransferReady, true);
  const changed = copy(source); changed.documents[0].blocks[0].assets[0].sha256 = 'b'.repeat(64);
  assert.ok(compareCurriculumSnapshots(source, changed, options).mismatches.some(item => item.code === 'ASSET_CHANGED'));
});

test('baseline hash catches edits made to the source after the migration started', () => {
  const source = sample(), original = inspectCurriculumSnapshot(source).digest;
  source.documents[0].blocks[0].payload.text += '\n추가된 내용';
  const result = compareCurriculumSnapshots(source, copy(source), { ...options, expectedSourceDigest: original });
  assert.ok(result.mismatches.some(item => item.code === 'SOURCE_CHANGED'));
});

test('expected track counts catch a partial export even when its target matches exactly', () => {
  const source = sample(); source.documents.pop();
  assert.ok(compareCurriculumSnapshots(source, copy(source), options).mismatches.some(item => item.code === 'SOURCE_TRACK_COUNT'));
});

for (const [name, change] of [
  ['unknown type', input => input.documents[0].blocks[0].type = 'new-special-tool'],
  ['duplicate block', input => input.documents[0].blocks.push(copy(input.documents[0].blocks[0]))],
  ['duplicate document', input => input.documents.push(copy(input.documents[0]))],
  ['unmapped authoring field', input => input.documents[0].unmapped = 'must preserve'],
  ['unknown version', input => input.formatVersion = 2],
  ['empty export', input => input.documents = []],
  ['undefined payload', input => input.documents[0].blocks[0].payload.text = undefined],
]) test(`fails closed for ${name}`, () => { const input = sample(); change(input); assert.throws(() => inspectCurriculumSnapshot(input), /Invalid curriculum snapshot/); });

test('reports contain no lesson copy, quiz answer content, or media URL query values', () => {
  const source = sample(), marker = 'private-content-marker';
  source.documents[0].title = marker;
  source.documents[0].blocks[0].payload = { text: marker, src: 'https://example.test/media?token=' + marker };
  assert.doesNotMatch(JSON.stringify(inspectCurriculumSnapshot(source)), new RegExp(marker));
  assert.doesNotMatch(JSON.stringify(compareCurriculumSnapshots(source, copy(source), options)), new RegExp(marker));
});

test('CLI exits nonzero on omissions and malformed JSON without leaking source snippets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'edu-transfer-test-'));
  try {
    const source = join(dir, 'source.json'), target = join(dir, 'target.json'), config = join(dir, 'options.json');
    writeFileSync(source, JSON.stringify(sample())); writeFileSync(target, JSON.stringify(sample())); writeFileSync(config, JSON.stringify(options));
    const run = () => spawnSync(process.execPath, ['scripts/check-curriculum-transfer.mjs', source, target, config], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
    assert.equal(run().status, 0);
    const missing = sample(); missing.documents.pop(); writeFileSync(target, JSON.stringify(missing));
    assert.equal(run().status, 1);
    writeFileSync(target, '{"secret": "never-print-me",');
    const invalid = run(); assert.equal(invalid.status, 2); assert.doesNotMatch(invalid.stdout + invalid.stderr, /never-print-me/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
