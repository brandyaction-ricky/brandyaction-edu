# Release guard executable preparation

Company policy is in [the OS canonical document](https://brandyaction-os.vercel.app/knowledge?document=687c3952-4766-4c85-996b-af57dbbc6667). This directory holds executable code, test setup and activation constraints, not a second policy copy.

## State

**Preparation / isolated QA only. No production adapter, runner, protected credential registry, GitHub environment protection or Vercel bypass restriction is installed.** Nothing in this branch intercepts existing Codex/Claude/CLI/dashboard deployments. Do not call it an active deployment lock.

`gate.mjs` provides the shared validation + transaction coordinator interface. `verify-plan.mjs` is offline validation only, and accepts no `--apply` mode. `release-coordinator.yml.example` deliberately lives outside `.github/workflows` and ends closed. The persistent coordinator installation and provider-specific mutation adapters need review with the actual activation configuration. Synthetic adapters in tests are not production integrations.

## Run preparation checks

Requires Node 22+, the root EDU dependencies, a MYIN checkout with its dependencies, and only disposable local DB processes. No hosted DB URL, Supabase service key, payment key or messaging key is accepted by the DB fixture.

```sh
npm ci --prefix tools/release-guard
node --test tools/release-guard/gate.test.mjs tools/release-guard/migrations.test.mjs
node tools/release-guard/core-checks.mjs /absolute/path/to/myin-checkout
```

The pinned embedded PostgreSQL package rehydrates its required local symlinks. It does not create OS users. PostgREST 16.6 must be installed at `tools/release-guard/.bin/postgrest` (or an explicitly supplied `POSTGREST_BIN`), from the official [release](https://github.com/PostgREST/postgrest/releases/tag/v16.6). On macOS the harness uses the bundled PostgreSQL libpq directory. The processes listen on random loopback ports and the temporary DB is removed after stopping them. The generated `.artifacts` evidence is ignored and contains counts, not customer data.

`core-checks.mjs` refuses a missing MYIN checkout or missing legacy report regression. It runs fixed required groups and fails on failed/cancelled/skipped/empty groups. It records exact repository heads and dirty state; this local QA summary is **not** a signed production approval or a full-CI replacement.

`tests/release-guard.test.mjs` includes the fast gate checks in the existing mandatory `npm test`. The proposed `.github/workflows/release-db-contract.yml` adds a credential-free PostgreSQL/PostgREST job for pull requests, with the Linux binary hash pinned to the official release asset. It does not deploy or apply SQL to hosted databases. The workflow has not run remotely yet; making it a required branch-protection check is a later approved settings change. The MYIN repository's private checkout and exact SHA must be supplied separately to the cross-product runner; the EDU-only job never substitutes for N6 report verification.

## Coverage and limits

- Twenty competing promises and eight independent processes: one lock owner. Owner interruption leaves a lock. A second owner cannot steal an old lock by age.
- Read current state after locking and again after approval. Missing production SHA, changed deployment, wrong project, missing ancestry, DB drift, stale/missing/skipped tests and migration mismatch block mutation.
- SQL/promotion/verification/recording failures retain the lock after any possible write; reconcile provider state before manual unlock. Never blindly retry an unknown SQL result.
- Real PostgreSQL + PostgREST: the welcome route's actual enrollment SELECT is extracted from source. The exact `edu_preserved_lesson_access` table/index/RLS/GRANT DDL is extracted from the existing migration. The earlier implicit join works before DDL, fails with PGRST201 after DDL, and the explicit current join passes on both schemas. Foreign owner/anonymous/revoked enrollment cases are denied.
- This REST fixture is the relevant schema slice, **not** an assertion that all production migrations/RLS/extensions are identical. Full target schema fingerprints and the complete old/new deployment matrix remain mandatory per actual release.
- Existing PGlite DB tests verify lesson-access persistence and partial-refund N6 entitlement; MYIN synthetic tests verify old report vocabulary and frozen-input integrity. They do not issue reports, call models, charge/refund payments, send messages or prove a completed customer's live UI.

## Historical SQL reconciliation found during preparation

The source baseline `0db98905cf4caab945e0c2c5a321af906063eb5e` did not contain the already approved #532 partial-refund SQL/test. The exact files from `8dcf7eaf78ddf23562a38d36565522fd1906dfff` are restored unchanged in this branch. This is source-history preservation, **not a new SQL change or permission to rerun SQL**. Compare applied migration version **and content hash**; `migrations.mjs` blocks unknown/changed applied content and excludes identical already applied SQL from pending work.

## Activation review checklist (not executed)

1. Resolve EDU production's missing Git metadata and align a formal release branch with the actual deployed source. Never use stale `main` to overwrite the live campus changes. `targets.json` intentionally leaves its release branch unset.
2. Select ONE coordinator repository/runner for all participating product repos and shared DB resources. Review a dedicated persistent runner and protected evidence/approval registry. Repository-level GitHub concurrency alone does not lock other repos or CLI calls. The file lock works only when all writes run through that one persistent coordinator; it is not a distributed lease.
3. Install a reviewed, least-privileged production adapter using `coordinate()`. It must obtain independent provider observations, applied SQL checksums, trusted check results and approvals bound to `digest(plan)`, never user-supplied JSON booleans. Candidate code must not run in the credential-bearing coordinator. Only fixed reviewed deployment/SQL actions may run.
4. Review provider-specific code/SQL/settings approval scopes and migration transaction/rollback behavior. Enforce old-code/new-DB compatibility before any SQL change. Keep credentials out of plans and artifacts.
5. Configure protected environment/reviewer and restrict production credentials, CLI/dashboard promotion and Git automatic deployments to this path. Existing MYIN main automatic deployment must not be switched off until the replacement is verified and approved. Inventory unavoidable admin bypass rights as residual risk.
6. Run the actual coordinator with a non-production disposable target, test interrupted operations and recovery, then request the exact production activation settings approval. Until then the guard is an executable preparation, not an operational guarantee.

References: [GitHub concurrency (repository scope, pending queue)](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [PostgREST relationship disambiguation](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html#foreign-key-joins-on-multiple-foreign-key-relationships).
