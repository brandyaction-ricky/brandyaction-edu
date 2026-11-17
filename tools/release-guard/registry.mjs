import {constants} from 'node:fs';
import {open, mkdir, rename} from 'node:fs/promises';
import {verify, createHash} from 'node:crypto';
import {join} from 'node:path';

export async function privateFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) || stat.uid !== process.getuid()) throw Error('Registry file must be owner-only');
    return await file.readFile('utf8');
  } finally { await file.close(); }
}
export function verifyEnvelope(envelope, publicKey, now = Date.now()) {
  const {payload, signature} = envelope;
  if (!payload || !verify(null, Buffer.from(JSON.stringify(payload)), publicKey, Buffer.from(signature || '', 'base64'))) throw Error('Invalid release signature');
  if (!Number.isFinite(payload.expiresAt) || now >= payload.expiresAt) throw Error('Release approval expired');
  const hash = createHash('sha256').update(JSON.stringify(payload.plan)).digest('hex');
  if (payload.approvals?.code !== hash) throw Error('Exact code approval missing');
  if (payload.plan.migrations.length && payload.approvals?.sql !== hash) throw Error('Exact SQL approval missing');
  return payload;
}
export async function atomicRecord(root, id, value) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw Error('Invalid request identifier');
  await mkdir(root, {recursive: true, mode: 0o700});
  const temporary = join(root, `${id}.${process.pid}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, join(root, `${id}.json`));
  const directory = await open(root, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
