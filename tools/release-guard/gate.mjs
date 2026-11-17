import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';

const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
export const REQUIRED = Object.freeze([
  'required-ci', 'db-old-old', 'db-old-new', 'db-new-new',
  'enrollment-welcome', 'lesson-access', 'partial-refund-n6', 'existing-n6-report',
]);
function requireThat(ok, reason) { if (!ok) throw new Error(reason); }
export function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

// Observations and evidence MUST come from the protected coordinator, not PR inputs.
// This is a validation contract, not a signature/approval authority.
export async function validate(plan, observed, evidence, isAncestor, now = Date.now()) {
  requireThat(plan.version === 1 && plan.environment === 'production', 'Invalid release scope');
  requireThat(sha.test(plan.candidate) && sha.test(plan.base), 'Missing immutable commit');
  requireThat(plan.project && plan.repository && plan.baseDeployment, 'Missing project identity');
  requireThat(observed.project === plan.project && observed.repository === plan.repository, 'Wrong target');
  requireThat(observed.environment === 'production', 'Wrong environment');
  requireThat(observed.liveSha === plan.base && observed.liveDeployment === plan.baseDeployment, 'Production moved or source unknown');
  requireThat(observed.releaseHead === plan.candidate, 'Candidate is not the official release head');
  requireThat(await isAncestor(plan.base, plan.candidate), 'Current production history is missing');
  requireThat(observed.unresolvedRun === false, 'An earlier release requires reconciliation');
  requireThat(hash.test(plan.dbBefore) && hash.test(plan.dbAfter), 'Missing DB fingerprints');
  requireThat(observed.dbFingerprint === plan.dbBefore, 'Database drift');
  requireThat(Array.isArray(plan.migrations) && Array.isArray(observed.pendingMigrations), 'Missing migration manifest');
  const seen = new Set();
  for (const migration of plan.migrations) {
    requireThat(/^supabase\/migrations\/\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(migration.path), 'Invalid migration path');
    const version = migration.path.split('/').at(-1).slice(0, 14);
    requireThat(!seen.has(version) && hash.test(migration.sha256), 'Duplicate or unhashed migration');
    seen.add(version);
  }
  requireThat(plan.migrations.map(m => m.path).join() === [...plan.migrations].sort((a,b) => a.path.localeCompare(b.path)).map(m => m.path).join(), 'Migration order changed');
  requireThat(digest(plan.migrations) === digest(observed.pendingMigrations), 'Migration scope changed');
  requireThat(plan.migrations.length > 0 || plan.dbBefore === plan.dbAfter, 'Unplanned DB change');
  requireThat(evidence.planDigest === digest(plan), 'Evidence belongs to another plan');
  requireThat(Number.isFinite(evidence.completedAt) && evidence.completedAt <= now && now - evidence.completedAt < 86400000, 'Evidence expired');
  requireThat(Array.isArray(evidence.checks), 'Checks missing');
  for (const id of REQUIRED) {
    const matches = evidence.checks.filter(c => c.id === id);
    requireThat(matches.length === 1, `Missing or duplicate check: ${id}`);
    const c = matches[0];
    requireThat(c.status === 'passed' && c.failed === 0 && c.skipped === 0 && c.cancelled === 0 && Number.isInteger(c.passed) && c.passed > 0, `Check not passed: ${id}`);
    requireThat(c.candidate === plan.candidate && c.base === plan.base && c.dbBefore === plan.dbBefore && c.dbAfter === plan.dbAfter, `Stale check: ${id}`);
  }
  return {validated: true, planDigest: digest(plan)};
}

// For ONE persistent coordinator only. Never advertise this as a distributed lock.
// Do not steal by TTL: an interrupted SQL/promotion may still be running remotely.
export async function acquireLock(root, owner = randomUUID()) {
  await mkdir(root, {recursive: true, mode: 0o700});
  const directory = join(root, 'production.lock');
  try { await mkdir(directory, {mode: 0o700}); }
  catch (e) { if (e.code === 'EEXIST') throw new Error('Production is locked; reconcile the existing run'); throw e; }
  try { await writeFile(join(directory, 'owner.json'), JSON.stringify({owner, createdAt: new Date().toISOString()}), {mode: 0o600}); }
  catch (e) { /* An incomplete lock stays closed for reconciliation. */ throw e; }
  return {
    owner,
    async assertOwned() {
      const value = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
      requireThat(value.owner === owner, 'Lock ownership lost');
    },
    async release() { await this.assertOwned(); await rm(directory, {recursive: true}); },
  };
}

// No network/SQL implementation is embedded here. The production adapter is a
// separately reviewed activation boundary; the QA adapter cannot contact production.
export async function coordinate({plan, evidence, lockRoot, adapter, now}) {
  const lock = await acquireLock(lockRoot);
  let mutationStarted = false;
  try {
    const observed = await adapter.observe(); // only AFTER acquiring the lock
    await validate(plan, observed, evidence, adapter.isAncestor, now);
    await lock.assertOwned();
    await adapter.verifyApprovals(digest(plan)); // code + exact SQL approvals
    const fresh = await adapter.observe();
    await validate(plan, fresh, evidence, adapter.isAncestor, now);
    await lock.assertOwned();
    mutationStarted = true; // even a timed-out call has an unknown remote outcome
    if (plan.migrations.length) await adapter.applyMigrations(plan.migrations);
    requireThat(await adapter.databaseFingerprint() === plan.dbAfter, 'Post-migration fingerprint mismatch');
    await lock.assertOwned();
    await adapter.promote(plan.candidate);
    await lock.assertOwned();
    const result = await adapter.verifyLive();
    requireThat(result.sha === plan.candidate && result.ready === true && result.smoke === 'passed', 'Post-deploy verification failed');
    await adapter.recordComplete(result);
    await lock.release();
    return result;
  } catch (e) {
    if (!mutationStarted) await lock.release();
    // Keep the persistent lock after any possible external mutation, including
    // errors during verification/recording. Operator reconciles before unlocking.
    throw e;
  }
}
