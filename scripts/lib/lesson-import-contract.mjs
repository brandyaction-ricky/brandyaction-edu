import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

let loaded;
// Compile our checked-in contracts, never code from the supplied export.
export function lessonImportContract() {
  loaded ??= build({ stdin: { contents: `export * from './lesson-blocks'; export * from './lesson-body'; export * from './lesson-guided-tools'; export * from './lesson-calculators'; export * from './lesson-curriculum-import'; export * from './lesson-media';`, resolveDir: fileURLToPath(new URL('../../lib/', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm' })
    .then(result => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64')));
  return loaded;
}
