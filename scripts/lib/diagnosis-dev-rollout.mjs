import {createHash} from 'node:crypto';
import {findOfficialMigration} from '../dev-migration-ledger.mjs';

// Deliberately excludes production refs and unrelated pending migrations.
const TARGETS = {
  edu: {projectRef: 'vjmjhaidlqkmascdjocw', files: [
    ['20261001062935_edu_diagnosis_entitlements.sql', '2abfe2d1d502fc7081b4a603c8f73d6036c200ccf54cfe96816fc5220ee72788'],
    ['20261001070447_edu_diagnosis_session_bridge.sql', '73e85d5d26a8946cf23d40eb44f1884ef71bb73e30c7c59792d3a01dd48ebca2'],
    ['20261001084748_edu_diagnosis_report_access.sql', 'cbba49ab135e7160e545e3fd8bda8956d1ea0c2255ab7330f04ee947f8d6bd24'],
  ]},
  myin: {projectRef: 'dmjiqtpqmwnpmwqtyehj', files: [
    ['20261001063515_n30_markdown_exports.sql', '3715f95c6e514dd2aaf3cab748edfb4a7a73c8adece140b5c0b546d6479e4bc8'],
    ['20261001070448_n30_edu_sessions.sql', 'e21b03a6441571494e3bf42758c482d1b1dfe70d21a574eeea9decd57d88e6c0'],
    ['20261001084740_n30_edu_report_worker.sql', 'b80e7e4946189af9060fff20e7eb876a3092ca4c307f4a643e08007f3cc64237'],
  ]},
};

export function diagnosisMigrationFiles(target) {
  if (!Object.hasOwn(TARGETS, target)) throw Error('Unknown diagnosis DEV target');
  return TARGETS[target].files.map(([file]) => file);
}

function ledgerRows(rows, label) {
  if (!Array.isArray(rows)) throw Error(`${label} ledger must be an array`);
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row.version !== 'string' || typeof row.name !== 'string' || seen.has(row.version))
      throw Error(`Invalid or duplicate ${label} ledger version`);
    seen.add(row.version);
  }
  return rows;
}

/** Offline preparation only: no database client, network request, credentials or apply mode. */
export function prepareDiagnosisDevRollout({target, projectRef, sources, official, checksums}) {
  diagnosisMigrationFiles(target);
  const spec = TARGETS[target];
  if (projectRef !== spec.projectRef) throw Error('Only the explicit diagnosis DEV project is allowed');
  ledgerRows(official, 'official');
  ledgerRows(checksums, 'checksum');
  const rows = spec.files.map(([file, expectedHash]) => {
    const sql = sources[file];
    if (typeof sql !== 'string') throw Error(`Missing migration source: ${file}`);
    const sha256 = createHash('sha256').update(sql).digest('hex');
    if (sha256 !== expectedHash) throw Error(`Migration changed since DEV verification: ${file}`);
    const [version, name] = [file.slice(0, 14), file.slice(15, -4)];
    const recorded = findOfficialMigration({version, name}, official);
    const checksum = checksums.find(row => row.version === version);
    if (checksum && (checksum.name !== name || checksum.checksum !== sha256))
      throw Error(`Applied migration checksum/name mismatch: ${file}`);
    return {file, version, name, sha256, state: recorded || checksum ? 'already_recorded' : 'pending',
      evidence: checksum ? 'checksum' : recorded ? 'official_ledger_only' : 'not_recorded'};
  });
  // A partially applied prefix is valid. A later phase with a missing prerequisite is not.
  let missing = false;
  for (const row of rows) {
    if (row.state === 'pending') missing = true;
    else if (missing) throw Error('Diagnosis migration history has a missing prerequisite');
  }
  const pending = rows.filter(row => row.state === 'pending');
  const verificationSql = [
    `-- DEV ${target}: ${projectRef}. Validation only; ALWAYS ROLLBACK.`,
    'begin;', "set local lock_timeout = '3s';", "set local statement_timeout = '30s';",
    ...pending.map(row => `-- ${row.file}\n` + sources[row.file].replace(/^\s*(begin|commit)\s*;\s*$/gim, '')),
    `select '${pending.length}'::integer as pending_migrations_validated;`, 'rollback;', '',
  ].join('\n');
  return {schemaVersion: 1, target, projectRef, mode: 'offline_verification_plan',
    migrations: rows, pendingCount: pending.length,
    warnings: rows.some(row => row.evidence === 'official_ledger_only')
      ? ['Official ledger confirms registration only; verify stored objects before activation.'] : [],
    verificationSql};
}
