# Persistent DEV QA: notification and trigger isolation review

This document is the public verification procedure. Actual target-environment observations, rule counts, trigger/function inventories and diagnostic conclusions are preserved only in the ignored local `04-trigger-risk.private.md`. This procedure does not establish that persistent QA provisioning is safe or authorized.

## Review before provisioning

Creating an Auth user can cause profile creation, automatic tags, CRM events and queued work. Enrollment changes, account status changes and cleanup can also trigger downstream actions. A reserved `@example.invalid` address, `qa_only` metadata, an internal-account flag or marketing opt-out is not sufficient evidence of isolation unless the actual recipient and worker paths enforce it.

1. Verify the DEV project, source version and Auth endpoint. Inspect the actual Auth mail/hook behavior without printing secrets, credential-bearing URLs, templates or customer records.
2. Use `04-notification-preflight.sql` for the read-only signup-rule review and `04-enrollment-notification-preflight.sql` for enrollment/tag dependencies. Review queue-side triggers and workers, including any dependency not previously covered. Neither query proves a worker's recipient behavior.
3. Confirm that no matching event can dispatch for the exact synthetic identities, or that an existing fail-closed QA recipient restriction is enforced through the entire worker path. Long queue delays and deletion immediately after account creation do not prevent a commit/worker race.
4. Inspect the actual enrollment and account cleanup paths. Reusing an existing QA actor avoids only new-profile creation; it does not prove enrollment mutation, tag recalculation, identity cleanup or account changes are harmless.
5. Freeze the reviewed trigger/function fingerprints privately and recheck them immediately before provisioning. Do not accept an unexplained new hash automatically. Do not disable shared triggers, workers, transmission switches or normal permission checks to pass QA.

## Stop conditions

Keep persistent provisioning and network QA unexecuted if any target, Auth hook, queue recipient, worker behavior, synthetic namespace collision or fingerprint drift remains unresolved. Do not repurpose real users, change a staff account's role to simulate a learner, inspect unrelated customer history, or assume a missing catalog function means no external worker exists.

The rollback-only SQL smoke proves its own transaction boundaries and local permission checks. It does not prove what committed queues, Auth hooks or external workers would do. A safe local test result does not replace the private target-specific review.

## Evidence and cleanup

Keep only necessary reviewed metadata in the private operator record; never publish raw function bodies, customer records, credentials or actual rule inventories. The public repository contains procedure and test code, not environment-specific approval evidence. Missing private evidence is a reason to stop.

After permitted QA, reconcile only the exact synthetic actors, enrollments, Storage paths and Realtime sessions in the private provisioning ledger. Queue cleanup is remediation, not the original isolation gate. Preserve audit evidence, stop on a claimed or dispatched unexpected job, and verify final deactivation before declaring the run complete. See `04-network-smoke.md` for the separately gated runner and cleanup contract.
