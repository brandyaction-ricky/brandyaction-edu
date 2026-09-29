import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readProductionBundle } from './lib/replit-production-bundle.mjs';
import { lessonPlanReport } from './lib/replit-lesson-plan.mjs';

try {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: node scripts/prepare-replit-bundle.mjs extracted-folder NEW-private-package');
  const { plan, files, sourceFiles } = await readProductionBundle(args[0]), root = resolve(args[1]);
  mkdirSync(root, { mode: 0o700 });
  for (const [path, bytes] of [...[...sourceFiles].map(([p, b]) => [`source-bundle/${p}`, b]), ...files]) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
  }
  mkdirSync(join(root, 'assets'), { recursive: true, mode: 0o700 });
  // Manifest last. Interrupted packages cannot pass verification.
  writeFileSync(join(root, 'plan.json'), JSON.stringify(plan), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ ...lessonPlanReport(plan), sourceBundleSha256: plan.sourceBundleSha256, sourceBuildVerified: false, packageWritten: true }, null, 2));
} catch (error) {
  console.error(error instanceof Error && /^(Usage:|Invalid production bundle:|Invalid lesson plan:|Invalid Replit export:|Invalid curriculum snapshot:)/.test(error.message) ? error.message : 'Unable to prepare bundle; existing files are not overwritten');
  process.exitCode = 2;
}
