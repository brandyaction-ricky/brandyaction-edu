import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readProductionBundle } from '../scripts/lib/replit-production-bundle.mjs';
import { readLessonPackage } from '../scripts/lib/replit-lesson-package.mjs';
import { bindReplitMedia } from '../scripts/lib/replit-media-binding.mjs';
import { sourceFixture, imageBytes } from './fixtures/replit-import-source.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const audio = Buffer.from('ID3synthetic-mp3');
function sums(root) {
  const paths = readdirSync(root, { recursive: true }).filter(p => p !== 'SHA256SUMS' && !p.endsWith('/') && !['media','media/embedded','media/uploads','days','source'].includes(p)).sort();
  writeFileSync(join(root, 'SHA256SUMS'), paths.map(p => `${sha(readFileSync(join(root, p)))}  ${p}\n`).join(''));
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'edu-production-bundle-test-')), s = sourceFixture();
  const image = s.days[0].blocks.find(b => b.type === 'image'), sound = s.days[0].blocks.find(b => b.type === 'audio');
  image.content = `data:image/png;base64,${imageBytes.toString('base64')}`;
  sound.content = '/api/uploads/lesson.mp3';
  const index = { extractedAt: s.exported_at, source: 'synthetic export', productionUrl: 'https://example.test', cohort: { id: 1, name: '가상 기수', active: true },
    days: [{ day: 1, path: 'days/day-01.json', title: s.days[0].title, blocks: s.days[0].blocks.length, missionChecks: s.days[0].mission_checks.length, lastUpdated: s.days[0].updated_at }], dayCount: 1, blockCount: s.days[0].blocks.length, lessonCount: 1, challengeCount: 1, embeddedMediaReferences: 1, embeddedMediaUnique: 1, uploadedMediaReferences: 1, downloadedMediaCount: 1, missingMedia: [] };
  const media = { embedded: [{ reference: `days/day-01.json.blocks.${s.days[0].blocks.indexOf(image)}.content`, path: 'media/embedded/image.png', mime: 'image/png', size: imageBytes.length, sha256: sha(imageBytes) }],
    uploadedReferences: [{ reference: `days/day-01.json.blocks.${s.days[0].blocks.indexOf(sound)}.content`, url: sound.content }],
    downloaded: [{ url: sound.content, path: 'media/uploads/lesson.mp3', mime: 'audio/mpeg', size: audio.length, sha256: sha(audio) }], missing: [] };
  const jsonFiles = { 'curriculum-index.json': index, 'source-manifest.json': { headCommit: 'a'.repeat(40), productionBuildComparison: 'Unknown' }, 'media-manifest.json': media,
    'days/day-01.json': s.days[0], 'learning_lessons.json': s.learning_lessons, 'ongoing_challenges.json': s.ongoing_challenges };
  for (const [path, bytes] of [...Object.entries(jsonFiles).map(([p,v]) => [p, JSON.stringify(v)]), ['media/embedded/image.png', imageBytes], ['media/uploads/lesson.mp3', audio], ['source/never-run.mjs', 'throw new Error("must never execute");']]) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes);
  }
  sums(root); return root;
}
function change(root, path, fn) { const value = JSON.parse(readFileSync(join(root, path))); fn(value); writeFileSync(join(root, path), JSON.stringify(value)); sums(root); }

test('latest folder retains original IDs, missing metadata and verified audio bytes; upload binding resolves both image and audio', async () => {
  const root = fixture(); try {
    const { plan, files } = await readProductionBundle(root), assets = plan.assets.filter(a => a.path);
    assert.equal(plan.lessons.length, 3); assert.equal(assets.length, 2); assert.equal(plan.configuration.cohorts[0].created_at, null);
    assert.deepEqual(plan.configuration.adminSettings, []); assert.equal(plan.delivery.sourceBuildVerified, false); assert.equal(plan.currentLiveContentVerified, false);
    const sound = assets.find(a => a.kind === 'audio'); assert.ok(files.get(sound.path).equals(audio)); assert.equal(sound.sourceUrl, '/api/uploads/lesson.mp3');
    const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ledger = { formatVersion: 1, sourceDigest: plan.sourceDigest, courseId, receipts: assets.map((a, i) => ({ formatVersion: 1, courseId, assetId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12,'0')}`, kind: a.kind, sha256: a.sha256, bytes: a.bytes, mimeType: a.mimeType, readyAt: '2026-09-29T00:00:00Z' })) };
    const bound = await bindReplitMedia(plan, ledger);
    assert.equal(bound.bindings.length, 2); assert.ok(bound.lessons[0].document.blocks.find(b=>b.type==='audio').assetId);
    assert.ok(!bound.issues.some(i=>i.code==='MEDIA_UPLOAD_PENDING')); assert.ok(bound.issues.some(i=>i.code==='EXTERNAL_MEDIA_UNVERIFIED'));
    const oldDigest = plan.sourceDigest, newAudio = Buffer.from('ID3different-mp3');
    writeFileSync(join(root,'media/uploads/lesson.mp3'),newAudio);
    change(root,'media-manifest.json',m=>{m.downloaded[0].sha256=sha(newAudio);m.downloaded[0].size=newAudio.length;});
    assert.notEqual((await readProductionBundle(root)).plan.sourceDigest, oldDigest);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
for (const [name, mutate, pattern] of [
  ['tampered file', r=>writeFileSync(join(r,'media/uploads/lesson.mp3'),'different'), /checksum/],
  ['unlisted source file', r=>writeFileSync(join(r,'source/extra.js'),'unexpected'), /unlisted/],
  ['path traversal', r=>writeFileSync(join(r,'SHA256SUMS'),`${'a'.repeat(64)}  ../outside\n`), /invalid checksum/],
  ['symlink', r=>{unlinkSync(join(r,'media/uploads/lesson.mp3'));symlinkSync('/etc/hosts',join(r,'media/uploads/lesson.mp3'));}, /symbolic/],
  ['wrong day count', r=>change(r,'curriculum-index.json',i=>i.blockCount++), /block total/],
  ['unlisted embedded reference', r=>change(r,'media-manifest.json',m=>m.embedded=[]), /unlisted embedded/],
  ['wrong original audio reference', r=>change(r,'media-manifest.json',m=>m.uploadedReferences[0].url='/api/uploads/other.mp3'), /reference differs/],
  ['spoofed audio type', r=>change(r,'media-manifest.json',m=>m.downloaded[0].mime='image/png'), /type does not match/],
  ['missing download', r=>change(r,'media-manifest.json',m=>m.downloaded=[]), /missing/],
  ['future block field', r=>change(r,'days/day-01.json',d=>d.blocks[0].future='must preserve'), /unmapped fields/],
]) test(`rejects ${name} without executing source or silently omitting content`,async()=>{
  const root=fixture();try{mutate(root);await assert.rejects(readProductionBundle(root),pattern);}finally{rmSync(root,{recursive:true,force:true});}
});
test('bundle CLI writes private reusable package; verifier detects source/plan/asset changes and does not overwrite',async()=>{
  const root=fixture(),parent=mkdtempSync(join(tmpdir(),'edu-bundle-package-test-')),out=join(parent,'package');
  const run=()=>spawnSync(process.execPath,['scripts/prepare-replit-bundle.mjs',root,out],{cwd:new URL('../',import.meta.url),encoding:'utf8'});
  try {
    const result=run();assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/example\.test|base64|correctIndex|must never/);
    assert.equal(run().status,2);const {plan}=await readLessonPackage(out);assert.equal(plan.lessons.length,3);
    const asset=join(out,plan.assets.find(a=>a.kind==='audio').path);writeFileSync(asset,'changed');await assert.rejects(readLessonPackage(out),/checksum/);
  }finally{rmSync(root,{recursive:true,force:true});rmSync(parent,{recursive:true,force:true});}
});
