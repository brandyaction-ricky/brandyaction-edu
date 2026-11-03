# DEV transactional permission smoke — prepared, not executed remotely

Target: **vjmjhaidlqkmascdjocw only**. Run only after the reviewed eleven campus migrations and postapply metadata checks succeed. This is an operator-owned SQL transaction, **not a Supabase login, browser session, payment/refund, Storage upload or bot integration test**.

## What the file exercises

`03-transactional-qa.sql` inserts four fabricated `auth.users`/profile identities, one course, two cohorts, four enrollments, one week and one lesson. The four identities represent an owner, a peer in the same cohort, another cohort, and a learner whose newly created enrollment is then marked refunded. The synthetic Auth records have no password, confirmed email, Auth identity or session, and no part of this transaction is committed.

Only these new records are used to create portfolio posts, focus notes, private business records, support requests and disconnected office jobs. Checks cover:

- Owner access; private peer isolation; explicitly shared same-cohort portfolio access; other-cohort denial.
- Forged user/enrollment writes through RLS and community/office RPCs.
- Refunded enrollment denial without deleting evidence.
- Archived cohort denial across community, focus, business, support, office and space membership.
- Anonymous table denial and browser denial of service-only office ingestion and review-window operations.
- Office requests remain `awaiting_connection`; no connector mapping or dispatch is activated.

The SQL checks that a browser cannot call the webhook ingestion RPC. **HMAC/timestamp/replay validation lives in the HTTP handler and cannot be proven by SQL.** `tests/campus-office.test.mjs` separately checks missing/invalid signatures without a network call. Root's later DEV route smoke must verify the deployed route when appropriate.

Every read of domain records in the smoke is restricted to fixed synthetic UUIDs or the matching new enrollment. There is no student content query, real order, actual refund, outbound message, paid call, `Storage.objects` mutation, trigger disable, RLS disable or permanent helper function.

## Execution guards

Use one verified operator connection for the whole file, with stop-on-first-error behavior. Do not split it between pooled connections. Confirm the selected project through the actual connector/connection target; a database named `postgres` is insufficient.

The reviewed runner must set all three session values **before** the file runs:

- `campus.qa.verified_project_ref = vjmjhaidlqkmascdjocw`
- `campus.qa.reviewed_seed_fingerprint` to `seedTriggerFingerprint` in the reviewed, local-only `03-seed-metadata-baseline.json` (intentionally excluded from the public repository).
- `campus.qa.reviewed_automation_fingerprint` to `automationFunctionFingerprint` in that file.

These values are the runner's assertions, not automated project discovery. Never recompute and accept an unexplained new fingerprint just to bypass a guard. Local PGlite uses its separately frozen, explicitly modeled fixture fingerprint; it is not the DEV fingerprint.

The file owns `BEGIN`/`ROLLBACK`, uses 3-second lock and 30-second statement timeouts, and takes a transaction-scoped QA advisory lock. It stops before insertion if the target assertion is missing, reviewed trigger/function metadata differs, a required relation is absent, or any fixed QA UUID/course key/email is already present. A collision is not permission to delete or reuse the existing row.

Fixed namespace: `f03c2026-1103-4000-8000-000000000001` through `...000000000999`; email namespace: `campus-rollback-qa-20261103-*@example.invalid`.

The final `transactional_assertions_passed_pending_rollback` result is valid only if the client also receives successful completion of the final **ROLLBACK**. An earlier error must remain a failure even if cleanup rollback succeeds. Preserve only sanitized assertion/error names and SQLSTATE, never application records or secrets. Close the connection after any error to force rollback; do not leave an aborted transaction open.

## Existing-trigger review

The private read-only DEV seed review records the triggers on every seed table. The frozen digest covers their trigger definitions and immediate function definitions, including signup/profile creation, CRM automation, Tips capture/queue hooks, enrollment access normalization and curriculum move guards. Trigger inventories and target-specific results remain in private operator evidence; the public instructions contain no student records.

CRM/Tips triggers can create transaction-local derived rows for a new synthetic member/cohort. Ordinary database queues remain invisible to other transactions and disappear on rollback. This is **not** by itself evidence that every downstream function has no synchronous external effect. The downstream function definitions in the private operator evidence were reviewed: CRM writes are transaction-local enqueue/tag rows, and Tips capture returns immediately when the synthetic member has no existing subject. The SQL rejects a pre-existing QA Tips subject or HMAC intent and verifies the frozen function digest before insertion. Inspect any further unexpected dependency and stop rather than disable existing triggers. Do not update automation settings, transmission flags or existing customer data to make this smoke pass.

No persistent QA account cleanup is required after a verified successful rollback. The script deliberately does not use hard deletes or an external cleanup job.

## Local verification and limits

`node --test tests/campus-dev-transactional-qa.test.mjs` passes four local checks:

1. All eleven campus migrations compose with the metadata-shaped substrate and modeled owner/enrollment RLS.
2. The **same SQL file** executes successfully, then every local table matches its pre-test snapshot and no QA-namespace UUID remains.
3. Missing target assertion or seed fingerprint, or an added seed trigger fails before insertion, preserving the database snapshot.
4. Missing automation fingerprint or a changed automation function likewise fails before insertion, preserving the database snapshot.

The harness blocks any `Storage.objects` INSERT/UPDATE/DELETE/TRUNCATE attempt. Auth/profile/course/cohort/enrollment column defaults and constraints were compared with the read-only DEV seed metadata. The local substrate has no production CRM/Tips functions and uses a separately frozen empty automation-function digest. Base RLS, Auth behavior and downstream integrations are local models; live trigger equivalence, real authentication, Storage/CORS, multiple concurrent real accounts and browser behavior remain distinct rollout checks. Tests do not contact DEV or production.
