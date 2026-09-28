import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareReplitLessonPlan } from './replit-lesson-plan.mjs';

export function readPackageFile(path, max = 32 * 1024 * 1024) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error('Invalid lesson package: expected bounded regular file');
  return readFileSync(path);
}
export function parsePackageJson(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Invalid lesson package: malformed JSON'); }
}
export async function readLessonPackage(path) {
  const directory = resolve(path), stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid lesson package: expected private directory');
  const source = readPackageFile(join(directory, 'source.json'));
  const { plan, files } = await prepareReplitLessonPlan(parsePackageJson(source));
  const manifest = { ...plan, sourceFileSha256: createHash('sha256').update(source).digest('hex') };
  if (JSON.stringify(parsePackageJson(readPackageFile(join(directory, 'plan.json')))) !== JSON.stringify(manifest)) throw new Error('Invalid lesson package: source and plan differ');
  const assetDirectory = lstatSync(join(directory, 'assets'));
  if (!assetDirectory.isDirectory() || assetDirectory.isSymbolicLink()) throw new Error('Invalid lesson package: asset directory must not be a link');
  for (const [path, expected] of files) if (!readPackageFile(join(directory, path)).equals(expected)) throw new Error('Invalid lesson package: asset checksum differs');
  return { plan: manifest, files };
}
