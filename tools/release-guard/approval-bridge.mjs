// Installed approval authority. Reads public GitHub receipts; never approves a run.
import {createHash, sign} from 'node:crypto';
import {constants} from 'node:fs';
import {open, lstat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {digest} from './gate.mjs';

export const hashBytes = value => createHash('sha256').update(value).digest('hex');
const requireThat = (ok, reason) => { if (!ok) throw Error(reason); };

// Root must never publish through a directory replaceable by the worker.
export async function protectedDirectory(path, ownerUid = 0) {
  requireThat(path === resolve(path), 'Absolute normalized directory required');
  for (let current = path;; current = dirname(current)) {
    const stat = await lstat(current);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === ownerUid && !(stat.mode & 0o022), 'Untrusted authority directory');
    if (current === dirname(current)) break;
  }
}

export async function readInbox(path, expectedUid) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    requireThat(stat.isFile() && stat.uid === expectedUid && !(stat.mode & 0o077) && stat.nlink === 1 && stat.size <= 2_000_000, 'Unsafe inbox file');
    return JSON.parse(await file.readFile('utf8'));
  } finally { await file.close(); }
}

export function validateReceipt(request, config, observation, now = Date.now()) {
  const {requestId, runId, runAttempt, payload} = request;
  requireThat(/^[A-Za-z0-9_-]{1,80}$/.test(requestId || ''), 'Invalid request ID');
  requireThat(Number.isSafeInteger(runId) && runId > 0 && runAttempt === 1, 'Only a new first-attempt run is accepted');
  const plan = payload?.plan;
  requireThat(plan?.repository === config.repository && plan.project === config.project && plan.productionHost === config.productionHost && plan.environment === 'production', 'Wrong release target');
  requireThat(/^[a-f0-9]{40}$/.test(plan.candidate || ''), 'Invalid candidate');
  // Initial activation is code-only. No migration credential is installed.
  requireThat(Array.isArray(plan.migrations) && plan.migrations.length === 0, 'SQL execution is not enabled');
  requireThat(payload.evidence?.planDigest === digest(plan), 'Evidence is not bound to the plan');
  const {run, approvals, workflowSource, headSha} = observation;
  requireThat(run.id === runId && run.run_attempt === runAttempt && run.repository?.full_name === config.repository, 'Wrong workflow run');
  requireThat(run.event === 'workflow_dispatch' && run.head_branch === 'main' && run.path === config.workflowPath, 'Wrong workflow entry');
  requireThat(run.status === 'completed' && run.conclusion === 'success', 'Approval workflow has not succeeded');
  requireThat(run.head_sha === plan.candidate && headSha === plan.candidate, 'Main or candidate changed');
  requireThat(run.display_title === `Release ${requestId} ${digest(payload)}`, 'Request digest not bound to approval');
  requireThat(hashBytes(workflowSource) === config.workflowSha256, 'Installed workflow trust pin changed');
  const updatedAt = Date.parse(run.updated_at);
  requireThat(Number.isFinite(updatedAt) && updatedAt <= now && now - updatedAt < 3_600_000, 'Run receipt is stale');
  const approved = approvals.filter(item => item.state === 'approved' && item.user?.id === config.approverId && item.environments?.some(env => env.id === config.environmentId && env.name === 'production-release-review'));
  requireThat(approved.length > 0, 'Representative approval is missing');
  requireThat(!approvals.some(item => item.state === 'rejected'), 'Rejected approval cannot be reused');
  return {requestId, runId, runAttempt, manifestDigest: digest(payload), approverId: config.approverId};
}

export async function publicGithub(path) {
  requireThat(path.startsWith('/repos/brandyaction-ricky/brandyaction-edu/'), 'Unregistered GitHub API path');
  const response = await fetch(new URL(path, 'https://api.github.com'), {headers:{Accept:'application/vnd.github+json','User-Agent':'brandyaction-release-coordinator'}, redirect:'error', signal:AbortSignal.timeout(15000)});
  requireThat(response.ok, `GitHub metadata unavailable (${response.status})`);
  return response.json();
}

export async function observeReceipt(request, config, api = publicGithub) {
  requireThat(Number.isSafeInteger(request.runId) && request.runId > 0, 'Invalid run ID');
  const prefix = `/repos/${config.repository}`;
  const run = await api(`${prefix}/actions/runs/${request.runId}`);
  requireThat(/^[a-f0-9]{40}$/.test(run.head_sha || ''), 'Invalid run SHA');
  const [approvals, workflow, head] = await Promise.all([
    api(`${prefix}/actions/runs/${request.runId}/approvals`),
    api(`${prefix}/contents/${config.workflowPath}?ref=${run.head_sha}`),
    api(`${prefix}/git/ref/heads/main`),
  ]);
  requireThat(workflow.encoding === 'base64' && workflow.type === 'file', 'Workflow source unavailable');
  return {run, approvals, workflowSource:Buffer.from(workflow.content,'base64'), headSha:head.object.sha};
}

export function signApprovedRequest(request, receipt, privateKey, now = Date.now()) {
  const payload = {...request.payload, expiresAt:now + 3_600_000, approvals:{code:digest(request.payload.plan)}, githubReceipt:receipt};
  return {payload, signature:sign(null,Buffer.from(JSON.stringify(payload)),privateKey).toString('base64')};
}
