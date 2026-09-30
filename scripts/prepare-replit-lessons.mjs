import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareReplitLessonPlan, lessonPlanReport } from './lib/replit-lesson-plan.mjs';
import { readLessonPackage, readPackageFile, parsePackageJson } from './lib/replit-lesson-package.mjs';

// Offline, curriculum-only packaging. No DB, deployment, source-script execution
// or URL fetch. All authored text, keys/quiz answers and source URLs stay private.
const args = process.argv.slice(2);
try {
  if (args.length !== 2) throw new Error('Usage: node scripts/prepare-replit-lessons.mjs export.json NEW-private-directory | --verify private-directory');
  const verifying = args[0] === '--verify', directory = resolve(args[1]);
  let plan;
  if (verifying) {
    ({ plan } = await readLessonPackage(directory));
  } else {
    const bytes = readPackageFile(args[0]), prepared = await prepareReplitLessonPlan(parsePackageJson(bytes));
    plan = prepared.plan;
    const files = prepared.files, manifest = { ...plan, sourceFileSha256: createHash('sha256').update(bytes).digest('hex') };
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
