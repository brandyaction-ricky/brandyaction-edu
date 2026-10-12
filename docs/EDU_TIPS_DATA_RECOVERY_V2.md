# EDU TIPS personal data feed and recovery (rc.2 candidate)

This adds `GET /api/internal/export/v2/events`, `GET /api/internal/export/v2/learning-usage`, `POST /api/internal/export/v2/recovery` and `POST /api/internal/export/v2/recovery/complete`. The EDU rc.2 schema is unchanged. MYIN events and N6/report/question/assignment contents are excluded. Existing v1 aggregates, E5 and education access are unchanged.

## Source and identity

- Only registered EDU subjects with current effective analysis **and** overseas consent, an active non-internal student profile and no unresolved previous erasure qualify. Registration remains explicit; this change does not enroll existing members or alter consent.
- Private triggers capture committed payment/refund state into immutable revisions and an outbox in the **same source transaction**, when `feed_state.capture_enabled` is explicitly enabled. Defaults are OFF. Source ambiguity creates a private constant-code quarantine; the original payment can finish but the feed fails closed until coherent source state repairs it.
- Payment amount is the original approved amount, never approved minus refunds. Completed partial refunds each have their own stable identifier; their total must agree with cancelled amount and remain within approved amount. Multi-item orders are quarantined rather than allocating or duplicating revenue.
- Random opaque mappings (256 random bits, not raw source IDs or hashes of UUIDs) are retained per subject and source record. Authentication-key changes do not change event IDs. Corrections increase revisions without renewing the original retention limit. The old effect must be replaced by the consumer, not added.
- Purchases/refunds retain original-event + 8760 hours. Delivery copies expire at the earlier of original expiry and queued + 720 hours. Immutable source revisions for full recovery retain the original 365/90-day bound, separately from delivery content.

## Learning coverage

`learning_usage_events` is a per-item first/last/count aggregate. It does **not** prove every historical day. New exact observed KST-day evidence is recorded only during enabled capture for an eligible subject, with the matching E3a evidence source. Repeat use of the same kind/item/day is deduplicated. Historical aggregate gaps are not filled with fake events or zeros. No activity-free rows are created. The first partial KST day after source capture or subject registration is unmeasured and is not emitted. Restarting capture after a gap resets coverage time and generation; previously unproven history is conservatively omitted.

No immutable dated curriculum denominator is available. Therefore `completed_items`, `total_items`, `curriculum_version`, `usage_ratio` are null, and historical availability/cohort state are unknown. Current registered curriculum is not substituted for past composition. Learning expires at KST-day start + 2160 hours. Null/absence is unmeasured, not disengagement. This change cannot provide complete learning history before capture starts.

## Publication and recovery

- One locked publisher assigns a separate committed publication sequence to **already committed** outbox rows. Source timestamps/UUID order are not watermarks. A previously allocated, late-committing source row receives a later publication sequence and is delivered next.
- A snapshot fixes H under that lock and reads immutable published revisions at H. Source changes after H go to subsequent incremental pages. Missing source projection for any eligible subject is an error, never an empty complete snapshot. Initial owner backfill of existing registered subjects is required before serving.
- Unpredictable signed cursors are registered by hash and bound to consumer/environment/brand/stream/generation/recovery/position/H/expiry. Snapshot-upper tokens are not position tokens. Initial calls without a cursor require recovery. Expired delivery gaps require recovery rather than silent skipping.
- Recovery requests are idempotent by consumer+requestId+reason. Same request returns the same initial signed cursors and cutoff; conflicting reason fails. Rebuild lifetime is 24 hours. A newer rebuild invalidates older staging sessions for the consumer. Reclassification/removal bumps the feed generation, requiring a new clean rebuild.
- Read all snapshot pages, then continue each terminal cursor through incremental pages. `has_more=false` ends a bounded page range, not proof the remote model was deleted. `complete` requires issued terminal incremental cursors at the latest H, the same active recovery, and all erasures issued and finally acknowledged. An intermediate/snapshot/foreign cursor fails.
- The consumer must reconcile the complete snapshot against its previous manifest and remove absent records; do not merge it into existing serving data. Serving remains paused through deletion/model resolution. Source `reconciled` verifies source cursors/deletion state; it does not independently prove TIPS permanent storage or model state.

## Gates, privileges and retention

- `EDU_TIPS_DATA_API_ENABLED` default OFF and owner-only DB `capture_enabled`/`serving_enabled` gates. Collection OFF is evaluated before external-key authentication. No credentials, subjects, external sender or enabled cron is seeded.
- New hash-only `data_keys` bind a consumer, environment, EDU brand and separate scopes `edu.events.read`, `edu.learning.read`, `edu.recovery`. All feed/rebuild requests share 30/min per consumer across keys/instances. Revocation is rechecked by the operation after the gate. Separate erasure and eligibility keys are not expanded.
- `EDU_TIPS_DATA_CURSOR_SECRET` signs feed cursors; `EDU_TIPS_ERASURE_CURSOR_SECRET` signs compatible deletion cursors. Do not copy production secrets to Preview. Keys/secrets are absent from code/logs.
- All tables are private with RLS and no anonymous/authenticated access. External RPCs are service-role-only SECURITY INVOKER with empty search path. Source/retirement triggers alone use tightly scoped SECURITY DEFINER, without direct public/service-role execution grants.
- Hourly `/api/cron/tips-data-retention` at minute 15 remains OFF unless `EDU_TIPS_DATA_RETENTION_ENABLED=true`. It requires the existing environment's `CRON_SECRET`. Its RPC prunes expired content independently of capture/serving, including while data collection is OFF. It preserves mappings, cursor metadata and deletion/audit evidence. Enable and verify this schedule before collecting any analysis copies.
- Retirement clears retained feed facts/revisions, queued content, snapshot content and TIPS-specific daily evidence for that member, independently of collection flags. Other members remain. Tombstone/receipt deadlines remain 120/720/720 hours.

## Verification and remaining gates

Local synthetic PostgreSQL (PGlite) tests execute the actual migration, private source triggers, permissions, RPCs and HTTP adapter. They cover partial refunds, correction identity/TTL, consent retirement, snapshots, later publication, expiry, missing projection, rebuild invalidation, rate/scope/credential boundaries and independent retention. The late-order case is a simulated committed-outbox ordering case, **not** a two-connection late-commit stress test.

Required before shared DEV activation: separate code/SQL approval, actual DEV schema/advisor checks, disposable A/B only, existing-subject projection/empty safety, real source atomicity/concurrency (two connections), pagination/expiry/rebuild/retention schedule and cleanup. No real customer test or customer-level TIPS transmission. Production code/SQL/config/activation remain separate approvals. Immediate remote revocation URL/auth/retry contract, TIPS consumer/model/backup/Modal evidence and full joint QA remain pending.

Rollback: turn off data serving/API flags while keeping retention, erasure, eligibility and evidence running. Do not undo privacy retirement, drop mappings or delete erasure audit to rollback code. No remote migration has been applied by this candidate.
