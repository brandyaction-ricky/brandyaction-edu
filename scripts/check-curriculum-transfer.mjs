import { readFileSync } from 'node:fs';
import { compareCurriculumSnapshots } from './lib/curriculum-transfer.mjs';

// Usage: node scripts/check-curriculum-transfer.mjs source.json target.json [options.json]
// No network, database credentials or database writes are used by this command.
const paths = process.argv.slice(2);
if (paths.length < 2 || paths.length > 3) {
  process.stderr.write('Usage: node scripts/check-curriculum-transfer.mjs source.json target.json [options.json]\n');
  process.exitCode = 2;
} else {
  try {
    const read = path => {
      const bytes = readFileSync(path);
      if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('Snapshot exceeds 32 MiB');
      // Do not expose JSON.parse snippets containing source material or credentials.
      try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Invalid JSON input'); }
    };
    const result = compareCurriculumSnapshots(read(paths[0]), read(paths[1]), paths[2] ? read(paths[2]) : {});
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.contentTransferReady ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error && /^(Invalid curriculum snapshot:|Snapshot exceeds|Invalid JSON input)/.test(error.message) ? error.message : 'Unable to read or compare snapshots';
    process.stderr.write(message + '\n');
    process.exitCode = 2;
  }
}
