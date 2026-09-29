import { mkdirSync, writeFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readLessonPackage, readPackageFile, parsePackageJson } from './lib/replit-lesson-package.mjs';
import { bindReplitMedia, mediaBindingReport } from './lib/replit-media-binding.mjs';

// Read-only comparison of local source bytes and destination upload receipts.
// Never connects to a DB, uploads assets, fetches a URL or publishes a lesson.
try {
  const args = process.argv.slice(2), verify = args[0] === '--verify';
  if (args.length !== 3) throw new Error('Usage: node scripts/bind-replit-lesson-media.mjs package receipt-ledger.json NEW-binding-directory | --verify package binding-directory');
  const directory = resolve(args[2]);
  if (verify && (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())) throw new Error('Invalid media binding: expected directory');
  const { plan } = await readLessonPackage(args[verify ? 1 : 0]);
  const ledgerBytes = readPackageFile(verify ? join(directory, 'receipts.json') : args[1], 8 * 1024 * 1024);
  const result = await bindReplitMedia(plan, parsePackageJson(ledgerBytes));
  if (verify) {
    if (JSON.stringify(parsePackageJson(readPackageFile(join(directory, 'bound-plan.json')))) !== JSON.stringify(result)) throw new Error('Invalid media binding: saved binding differs');
  } else {
    mkdirSync(directory, { mode: 0o700 });
    writeFileSync(join(directory, 'receipts.json'), ledgerBytes, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(directory, 'bound-plan.json'), JSON.stringify(result), { mode: 0o600, flag: 'wx' });
  }
  process.stdout.write(JSON.stringify({ ...mediaBindingReport(result), bindingWritten: !verify, bindingVerified: verify }, null, 2) + '\n');
} catch (error) {
  const message = error instanceof Error && /^(Usage:|Invalid media binding:|Invalid lesson package:|Invalid lesson plan:|Invalid Replit export:|Invalid curriculum snapshot:)/.test(error.message) ? error.message : 'Unable to bind or verify the private package; no existing files are overwritten';
  process.stderr.write(message + '\n'); process.exitCode = 2;
}
