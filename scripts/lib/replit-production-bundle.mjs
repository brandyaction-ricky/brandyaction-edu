import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { prepareReplitLessonPlan } from './replit-lesson-plan.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw new Error('Invalid production bundle: ' + reason); };
const pathOk = path => typeof path === 'string' && /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith('/') && path.split('/').every(p => p && p !== '.' && p !== '..');
const equal = (a, b, reason) => { if (a !== b) fail(reason); };

// All supplied source code is inert data. Read only allowlisted JSON/media;
// check every file (including the unused source) against the delivery manifest.
// Checksums establish integrity of this delivery, not its publisher's identity
// or equivalence to the current live Replit deployment.
export async function readProductionBundle(directory) {
  const root = resolve(directory), paths = [], files = new Map();
  let total = 0;
  function walk(path = '') {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) fail('symbolic links are not accepted');
    if (stat.isDirectory()) {
      for (const entry of readdirSync(join(root, path))) {
        const next = path ? `${path}/${entry}` : entry;
        if (!pathOk(next) || next.split('/').length > 20) fail('unsafe path');
        walk(next);
      }
    } else {
      if (!stat.isFile() || stat.size > 50 * 1024 * 1024 || (total += stat.size) > 512 * 1024 * 1024 || paths.length >= 2000) fail('file limits exceeded');
      paths.push(path);
    }
  }
  if (!lstatSync(root).isDirectory()) fail('expected a directory');
  walk();
  if (!paths.includes('SHA256SUMS')) fail('checksum manifest missing');
  const sums = readFileSync(join(root, 'SHA256SUMS'));
  if (sums.length > 1024 * 1024) fail('checksum manifest too large');
  const expected = new Map();
  for (const line of sums.toString('utf8').trim().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || !pathOk(match[2]) || match[2] === 'SHA256SUMS' || expected.has(match[2])) fail('invalid checksum entry');
    expected.set(match[2], match[1]);
  }
  equal(paths.length, expected.size + 1, 'unlisted or missing files');
  for (const path of paths) {
    const bytes = readFileSync(join(root, path));
    if (path !== 'SHA256SUMS') equal(sha(bytes), expected.get(path), 'file checksum differs');
    files.set(path, bytes);
  }
  function json(path) {
    const bytes = files.get(path);
    if (!bytes || bytes.length > 32 * 1024 * 1024) fail('required JSON missing or too large');
    try { return JSON.parse(bytes.toString('utf8')); } catch { fail('invalid JSON'); }
  }
  const index = json('curriculum-index.json'), sourceManifest = json('source-manifest.json'), media = json('media-manifest.json');
  if (!Array.isArray(index.days) || index.days.length < 1 || index.days.length > 30 || !index.cohort || !Number.isSafeInteger(index.cohort.id) || typeof index.cohort.active !== 'boolean') fail('invalid curriculum index');
  if (files.size !== expected.size + 1 || typeof sourceManifest.productionBuildComparison !== 'string' || typeof sourceManifest.headCommit !== 'string') fail('source provenance missing');
  const days = index.days.map((entry, position) => {
    equal(entry.day, position + 1, 'day sequence differs');
    equal(entry.path, `days/day-${String(entry.day).padStart(2, '0')}.json`, 'day path differs');
    const row = json(entry.path);
    equal(row.day_number, entry.day, 'day number differs');
    equal(row.cohort_id, index.cohort.id, 'cohort differs');
    equal(row.title, entry.title, 'day title differs');
    equal(row.blocks?.length, entry.blocks, 'block count differs');
    equal(row.mission_checks?.length, entry.missionChecks, 'checklist count differs');
    equal(row.updated_at, entry.lastUpdated, 'day timestamp differs');
    return row;
  });
  const learning = json('learning_lessons.json'), ongoing = json('ongoing_challenges.json');
  equal(days.length, index.dayCount, 'day total differs');
  equal(days.reduce((n, d) => n + d.blocks.length, 0), index.blockCount, 'block total differs');
  equal(learning.length, index.lessonCount, 'learning total differs');
  equal(ongoing.length, index.challengeCount, 'ongoing total differs');
  for (const key of ['embedded', 'uploadedReferences', 'downloaded', 'missing']) if (!Array.isArray(media[key])) fail('invalid media manifest');
  if (media.missing.length || !Array.isArray(index.missingMedia) || index.missingMedia.length) fail('delivery reports missing media');
  const source = { export_type: 'curriculum_bundle', source_project: index.productionUrl, exported_at: index.extractedAt,
    cohorts: [{ id: index.cohort.id, name: index.cohort.name, is_active: index.cohort.active, description: null, created_at: null }],
    days, learning_lessons: learning, ongoing_challenges: ongoing, admin_settings: [] };
  const refs = new Map();
  for (const [path, value] of [...days.map((row, i) => [index.days[i].path, row]), ['learning_lessons.json', learning], ['ongoing_challenges.json', ongoing]]) {
    function visit(item, at) {
      if (typeof item === 'string') refs.set(at, item);
      else if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) visit(child, `${at}.${key}`);
    }
    visit(value, path);
  }
  function mediaBytes(row, prefix) {
    if (!pathOk(row.path) || !row.path.startsWith(prefix) || !files.has(row.path)) fail('media path differs');
    const bytes = files.get(row.path);
    equal(bytes.length, row.size, 'media size differs'); equal(sha(bytes), row.sha256, 'media checksum differs');
    return bytes;
  }
  const embeddedRefs = new Set();
  for (const row of media.embedded) {
    const raw = refs.get(row.reference), bytes = mediaBytes(row, 'media/embedded/');
    if (embeddedRefs.has(row.reference)) fail('duplicate embedded reference');
    embeddedRefs.add(row.reference);
    equal(raw, `data:${row.mime};base64,${bytes.toString('base64')}`, 'embedded reference differs');
  }
  for (const [ref, raw] of refs) if (raw.startsWith('data:') && !embeddedRefs.has(ref)) fail('unlisted embedded media');
  const localMedia = new Map(), usedDownloads = new Set(), uploadRefs = new Set();
  for (const row of media.downloaded) {
    if (typeof row.url !== 'string' || !/^\/api\/uploads\/[A-Za-z0-9_.-]+$/.test(row.url) || localMedia.has(row.url)) fail('invalid upload reference');
    localMedia.set(row.url, { name: basename(row.path), mimeType: row.mime, bytes: mediaBytes(row, 'media/uploads/') });
  }
  for (const row of media.uploadedReferences) {
    if (uploadRefs.has(row.reference)) fail('duplicate uploaded reference');
    uploadRefs.add(row.reference);
    equal(refs.get(row.reference), row.url, 'uploaded reference differs');
    if (!localMedia.has(row.url)) fail('uploaded media missing');
    usedDownloads.add(row.url);
  }
  for (const [ref, raw] of refs) if (raw.startsWith('/api/uploads/') && !uploadRefs.has(ref)) fail('unlisted uploaded media');
  equal(usedDownloads.size, localMedia.size, 'unreferenced download');
  equal(index.embeddedMediaReferences, embeddedRefs.size, 'embedded total differs');
  equal(index.embeddedMediaUnique, new Set(media.embedded.map(row => row.sha256)).size, 'embedded unique total differs');
  equal(index.uploadedMediaReferences, uploadRefs.size, 'uploaded total differs');
  equal(index.downloadedMediaCount, localMedia.size, 'downloaded total differs');
  const prepared = await prepareReplitLessonPlan(source, localMedia);
  const sourceFileSha256 = sha(JSON.stringify(source));
  const plan = { ...prepared.plan, sourceFileSha256, sourceBundleSha256: sha(sums),
    delivery: { capturedAt: index.extractedAt, source: index.source, sourceCommit: sourceManifest.headCommit,
      sourceBuildVerified: false, omittedConfiguration: ['cohorts.description', 'cohorts.created_at', 'admin_settings'] } };
  return { plan, files: prepared.files, sourceFiles: files };
}
