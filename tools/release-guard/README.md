# Release guard executable preparation

Company policy is in [the OS canonical document](https://brandyaction-os.vercel.app/knowledge?document=687c3952-4766-4c85-996b-af57dbbc6667). This directory holds executable code, test setup and activation constraints, not a second policy copy.

## State

**Implementation / isolated integration QA only. Production execution remains disabled.** The provider adapter and signed-request runner are implemented and exercised against a real local PostgreSQL database and a loopback provider simulator. Production credentials, dedicated runner installation, GitHub environment protection and Vercel bypass restrictions are not activated. Nothing in this branch intercepts existing Codex/Claude/CLI/dashboard deployments.

`run-request.mjs` connects the signed registry, persistent lock, journal and fixed GitHub/Vercel/PostgreSQL operations. `verify-plan.mjs` remains offline validation only. `release-coordinator.yml.example` lives outside `.github/workflows`; the production config example has `executionEnabled: false`. Installing the entry point and binding production credentials require later approval. Provider writes in integration QA are simulated HTTP, not hosted deployment tests.

## Run preparation checks

Requires Node 22+, the root EDU dependencies, a MYIN checkout with its dependencies, and only disposable local DB processes. No hosted DB URL, Supabase service key, payment key or messaging key is accepted by the DB fixture.

```sh
npm ci --prefix tools/release-guard
node --test tools/release-guard/gate.test.mjs tools/release-guard/migrations.test.mjs
node tools/release-guard/core-checks.mjs /absolute/path/to/myin-checkout
node tools/release-guard/integration.mjs
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

1. Review the alignment PR before merging main: all 2,267 uploaded sources from the live CLI deployment match `0db98905`; see `alignment.json`. The merge candidate preserves the entire runtime tree while adding main ancestry. Actual main is unchanged. The first transition may use a signed baseline source attestation bound to deployment ID and freshly checked source-tree fingerprint; subsequent Git deployments must carry their exact SHA.
2. Select ONE coordinator repository/runner for all participating product repos and shared DB resources. Review a dedicated persistent runner and protected evidence/approval registry. Repository-level GitHub concurrency alone does not lock other repos or CLI calls. The file lock works only when all writes run through that one persistent coordinator; it is not a distributed lease.
3. Install the reviewed runner with owner-only config, credential files, public approval key, request registry and journal outside every product checkout. The approval signing key must remain outside the credential-bearing runner. Production origins are fixed; rehearsal permits loopback only. The adapter reads live Git head, deployment identity, structural DB fingerprint and migration history. It verifies exact GitHub Actions app/check/SHA results plus a signed evidence bundle. Candidate scripts are never executed on the privileged runner; Git is used only to inspect ancestry and read approved SQL blobs.
4. Review provider-specific code/SQL/settings approval scopes and migration transaction/rollback behavior. Enforce old-code/new-DB compatibility before any SQL change. Keep credentials out of plans and artifacts.
5. Configure protected environment/reviewer and restrict production credentials, CLI/dashboard promotion and Git automatic deployments to this path. Existing MYIN main automatic deployment must not be switched off until the replacement is verified and approved. Inventory unavoidable admin bypass rights as residual risk.
6. Run the actual coordinator with a non-production disposable target, test interrupted operations and recovery, then request the exact production activation settings approval. Until then the guard is an executable preparation, not an operational guarantee.

## Provider and DB boundaries

The adapter promotes an already-built, READY production-target deployment with the exact approved SHA. It refuses to promote a preview-target build that could contain DEV configuration. Build creation, main merge, production configuration changes and automatic rollback are not runner operations. SQL is read from the approved immutable commit, content-hashed, applied in one transaction with the Supabase migration ledger, and never replayed if its version is already present. Transaction-controlling migrations outside simple outer BEGIN/COMMIT require separate review. Structural fingerprints include public/edu_private columns, constraints, RLS, grants, functions, indexes, views and migration history; they are not a backup and do not cover external services/extensions/configuration. Those need separate checks when touched.

The production signing workflow, DB role grants and credential restriction remain installation decisions, not inferred approvals. Signed test evidence is required even when GitHub reports green. A complete prior migration checksum reconciliation and the exact old/new schema matrix must be supplied per release; the new integration fixture does not replace that work. Post-deploy checking currently proves deployment identity and `/api/health`; authenticated customer-path checks remain a separate release requirement.

Production settings proposed for review: one persistent coordinator; a protected approval environment; 15 required EDU check jobs and pinned cross-product evidence; read-only GitHub metadata credentials; a Vercel credential scoped as narrowly as the account supports; separate read-only/preflight and explicitly approved migration authority; owner-only secret/registry paths; direct Git/CLI/dashboard deployment bypass restrictions. No setting or credential has been changed by this branch. Reverting runner activation does not revert SQL or deployment effects; preserve the journal and lock until an interrupted run is reconciled.

References: [GitHub concurrency (repository scope, pending queue)](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [PostgREST relationship disambiguation](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html#foreign-key-joins-on-multiple-foreign-key-relationships).
