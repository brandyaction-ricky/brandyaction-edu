# Personal AI Office adapter v1

Status: local implementation and mock verification only. Yoonik's merged ZIP and actual Telegram worker have not been received/connected. No dispatch, bot process, AI request, Telegram message, production mutation or secret setup is performed by this module.

## EDU boundary

`OfficePanel({ snapshot, demo })` from `panel.tsx` (alias `Panel`) is independent of the spatial renderer. Mount it in the EDU shell or open it from the office object in the future ZIP. Never move EDU session cookies or Supabase service keys into the ZIP/iframe. A renderer may request the panel open; EDU owns authentication, account mapping, job records, permissions, and human approvals.

`GET /api/campus/office?enrollmentId=<uuid>` and `POST /api/campus/office` use the current EDU session and current active enrollment. Both require `EDU_CAMPUS_ENABLED=true` and `EDU_CAMPUS_OFFICE_ENABLED=true`. New SQL `20261102154425_edu_campus_private_office_jobs.sql` depends on the community migration's safe-URL helper; neither is applied remotely here.

Learner commands:

- `create`: requestId, enrollmentId, objective (10–2,000 characters), outputType (plan/copy/checklist/analysis), materialUrls (up to 5 HTTPS links). Creates **awaiting_connection**, never sends work externally.
- `approve`: jobId, expectedRevision, note (5–2,000 chars). Only the owner can approve an existing received draft in `review`.
- `request_revision`: same fields. Review → revision_requested; the bot must explicitly accept again.
- `retry`: failed → awaiting_connection. This does not execute or resend anything.
- `archive`: only settled states. Running/queued jobs cannot be silently archived as though canceled.

All commands have actor-bound idempotent receipts; same key + changed body conflicts. Revision conflicts return 409. Limits: 50 open requests per enrollment and 10 creates/minute. Lists cap 200 jobs/3,000 history rows and fail visibly if truncated; pagination beyond this private-inbox limit is a later extension.

## Signed incoming events

Future worker endpoint: `POST /api/campus/office/webhook` (`application/json`). It does not accept EDU cookies as a substitute for the signature.

Headers:

- `x-campus-connector`: configured lowercase connector ID
- `x-campus-key-version`: configured key version
- `x-campus-timestamp`: Unix seconds, accepted within ±300 seconds
- `x-campus-event-id`: UUID retained for every retry
- `x-campus-signature`: `v1=<lowercase hex HMAC-SHA256>`

Signed string is exactly `${connectorId}.${keyVersion}.${timestamp}.${eventId}.${rawUtf8Body}`. Sign before transport without reformatting JSON. The receiver uses a timing-safe comparison, rejects malformed UTF-8 and enforces a streaming 48 KB body limit. Connector identity and key version are part of the signed context. Do not send keys or signatures to client JS or screenshots/logs.

Event body:

```json
{"jobId":"<uuid>","expectedRevision":1,"event":"accepted","note":""}
```

Event transitions:

| Event | Allowed state | Result |
|---|---|---|
| accepted | awaiting_connection / revision_requested | queued |
| started | queued | running |
| draft | running | review |
| failed | queued / running | failed |

`draft` includes `draftText` (10–10,000 chars), optional `draftUrl` (HTTPS). `failed` needs a safe user-facing `note` (5–1,000 chars). No event can create a job, change owner, bypass a revision, approve, publish, message customers, or mark a task complete automatically. Approved means the learner explicitly reviewed it.

The signed event is validated twice: header HMAC configuration and a database mapping of connector ID + owner ID + key version + enabled. A connector becomes pinned to the job on first receipt; another connector cannot take it over implicitly. Mapping must be prepared explicitly by an operator. Nothing inserts or enables mappings automatically.

Same connector + eventId + identical raw body is an idempotent retry. Reusing the ID with a different payload is 409. The event and history/revision update commit atomically. A revoked enrollment or disabled mapping fails closed even for retries.

## Configuration contract (currently absent)

Server-only `EDU_CAMPUS_OFFICE_CONNECTORS_JSON`:

```json
[{"id":"yoonik-office","keyVersion":"v1","secretEnv":"EDU_CAMPUS_OFFICE_YOONIK_SECRET","ownerIds":["<approved-owner-uuid>"]}]
```

The referenced secret needs at least 32 characters and must be unique per connector. Malformed, duplicate or reused-secret configuration is rejected as a whole. No secret value is returned to the UI. The matching private DB mapping is also required. Public wrappers are security invoker; ingestion execution is granted only to `service_role`, with narrow private definer authorization. Normal authenticated users cannot call ingestion or directly mutate jobs/history/mappings.

The current implementation has **no outbound worker dispatcher**. `incoming_adapter_registered` only means a mapped incoming adapter exists, not that a worker is alive or that jobs were sent. A future dispatcher must be added and tested with Yoonik's actual host/worker authentication and explicit account mappings before real execution can be claimed. The renderer's cosmetics and bot labels are not task evidence.

## Verification and rollback

Local PGlite executes RLS, grant denials, active scope, connector mapping, replay and CAS, human review, archive and revocation tests. HMAC tests cover body/header/timestamp/key tampering. Demo events are visibly synthetic and do not hit any API.

Local verification: 7 domain/API/HMAC/PGlite tests and 4 desktop/mobile browser scenarios passed. Run `node --test tests/campus-office.test.mjs` and `npx playwright test --config=tests/campus-office.playwright.config.ts --output=test-results/campus-office`. The latter starts an isolated mock fixture on port 4493 so it can run before the shared workspace mounts this panel; it is not a deployed DEV site or a real bot connection.

To disable, turn off the office gate and keep job/history/event evidence. Do not drop records or remove an original ZIP. Actual DEV/production provider integration, key rotation, end-to-end dispatch, long-running process health and failure recovery remain rollout checks.
