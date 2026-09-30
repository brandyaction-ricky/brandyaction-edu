import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeReplitCurriculum } from './lib/replit-curriculum.mjs';
import { inspectCurriculumSnapshot } from './lib/curriculum-transfer.mjs';

// Usage: node scripts/prepare-replit-curriculum.mjs export.json [NEW-snapshot.json]
// Snapshot includes paid curriculum/answers: keep it outside Git and web roots.
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2) {
  process.stderr.write('Usage: node scripts/prepare-replit-curriculum.mjs export.json [NEW-snapshot.json]\n');
  process.exitCode = 2;
} else {
  try {
    const bytes = readFileSync(args[0]);
    if (bytes.length > 32 * 1024 * 1024) throw new Error('Export exceeds 32 MiB');
    let source;
    try { source = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Invalid JSON input'); }
    const snapshot = normalizeReplitCurriculum(source);
    const report = inspectCurriculumSnapshot(snapshot);
    if (args[1]) writeFileSync(args[1], JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
    process.stdout.write(JSON.stringify({
      sourceFileSha256: createHash('sha256').update(bytes).digest('hex'),
      capturedAt: report.capturedAt, sourceDigest: report.digest, counts: report.counts,
      issues: report.issues, currentLiveContentVerified: false, snapshotWritten: Boolean(args[1]),
    }, null, 2) + '\n');
  } catch (error) {
    const message = error instanceof Error && /^(Invalid Replit export:|Invalid curriculum snapshot:|Export exceeds|Invalid JSON input)/.test(error.message) ? error.message : 'Unable to read export or create a new snapshot (existing files are never overwritten)';
    process.stderr.write(message + '\n'); process.exitCode = 2;
  }
}
