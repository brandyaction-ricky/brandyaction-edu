import { mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareReplitLessonPlan, lessonPlanReport } from './lib/replit-lesson-plan.mjs';

// Offline, curriculum-only packaging. No DB, deployment, source-script execution
// or URL fetch. All authored text, keys/quiz answers and source URLs stay private.
function read(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) throw new Error('Invalid lesson package: expected regular file under 32 MiB');
  return readFileSync(path);
}
function parse(bytes) { try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Invalid lesson package: malformed JSON'); } }
const args = process.argv.slice(2);
try {
  if (args.length !== 2) throw new Error('Usage: node scripts/prepare-replit-lessons.mjs export.json NEW-private-directory | --verify private-directory');
  const verifying = args[0] === '--verify', directory = resolve(args[1]);
  if (verifying && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) throw new Error('Invalid lesson package: expected private directory');
  const bytes = read(verifying ? join(directory, 'source.json') : args[0]);
  const { plan, files } = await prepareReplitLessonPlan(parse(bytes));
  const manifest = { ...plan, sourceFileSha256: createHash('sha256').update(bytes).digest('hex') };
  if (verifying) {
    if (JSON.stringify(parse(read(join(directory, 'plan.json')))) !== JSON.stringify(manifest)) throw new Error('Invalid lesson package: source and plan differ');
    for (const [path, expected] of files) {
      if (lstatSync(join(directory, 'assets')).isSymbolicLink()) throw new Error('Invalid lesson package: asset directory must not be a link');
      const actual = read(join(directory, path));
      if (!actual.equals(expected)) throw new Error('Invalid lesson package: asset checksum differs');
    }
  } else {
    // mkdir without recursive/exist_ok prevents replacing any existing directory.
    // The manifest is written last: a failed/partial package cannot verify.
    mkdirSync(directory, { mode: 0o700 }); mkdirSync(join(directory, 'assets'), { mode: 0o700 });
    writeFileSync(join(directory, 'source.json'), bytes, { mode: 0o600, flag: 'wx' });
    for (const [path, data] of files) writeFileSync(join(directory, path), data, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(directory, 'plan.json'), JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  }
  process.stdout.write(JSON.stringify({ ...lessonPlanReport(plan), packageWritten: !verifying, packageVerified: verifying }, null, 2) + '\n');
} catch (error) {
  const message = error instanceof Error && /^(Usage:|Invalid lesson package:|Invalid lesson plan:|Invalid Replit export:|Invalid curriculum snapshot:)/.test(error.message) ? error.message : 'Unable to prepare or verify the private package; no existing files are overwritten';
  process.stderr.write(message + '\n'); process.exitCode = 2;
}
