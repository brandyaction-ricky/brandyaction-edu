# Personal AI Office adapter v1

## Telegram / Aside development pilot (2026-11-06)

`scripts/campus-aside-watch.mjs` observes one explicitly selected local Aside
session using documented CLI/REPL APIs. It does not consume Telegram updates,
replace a webhook, execute AI tasks, or collect a vault. The employee receives
instructions through its Telegram channel. The watcher reports the exact matched
request, actual turn lifecycle and final answer to the signed webhook. A received
answer remains **review**, never approval.

1. Use verified DEV Supabase/Vercel and the owner's active QA enrollment. Create
   the task in the office and note its ID (revision 1).
2. Register one connector/owner mapping and a fresh signing key. Keep the local
   key in a private file (600 on macOS/Linux), outside Git. Telegram credentials
   remain in Aside's OS secure storage.
3. Record the real Aside account, channel connection and session ID. Hash the
   **exact** next Telegram task text with `promptDigest`; set `notBefore` before
   sending it. Put the job ID in the message. Follow-ups or repeated identical
   requests require reconciliation; the watcher does not guess.
4. Prepare a private config with `environment: "development"`, `endpoint`,
   `connectorId`, `keyVersion`, `secretFile`, `jobId`, `account` (e.g. `u0`),
   `connectionId`, `sessionId`, `promptHash`, `notBefore` and `reportDir`.
   Run `node scripts/campus-aside-watch.mjs /absolute/private/config.json`.
   Optional `transport: "vercel-cli"` reuses the operator's existing Vercel login
   for protected Preview access; it is not a student deployment requirement.
5. Send the task in Telegram. Verify queued/running/review and the actual result
   in the office, then reopen it. The panel polls every five seconds only while
   active and visible, pauses during mutations, and reports refresh failures.
6. On a transport failure, inspect saved reports and rerun the same config.
   Persisted event IDs/bodies and server receipts prevent duplicate reports.
   Never reset revisions or auto-approve a result to pass QA.

`campus-office-report.mjs prepare INPUT_JSON SAVED_REPORT` and
`send CONFIG_JSON SAVED_REPORT` also support explicit employee reports.
A signature authenticates the reporter; it does not independently prove the work.

Pilot limits: one existing job at revision 1, one exact Telegram request and
Aside turn, latest 100 transcript messages, 30-minute observation, final answer
of 10–10,000 characters. Missing/ambiguous evidence fails visibly. No self-service
pairing, daemon, heartbeat, multi-employee dispatch or production rollout is
implemented here. Disable the connector mapping/key when retiring the pilot.
Local fixtures are synthetic; real DEV/Telegram evidence belongs in the OS log.

Status (2026-11-05): Yoonik’s ZIP has been received and its character/space renderer is integrated. Personal bot profiles can be imported, saved and synchronized under the EDU account. The campus is deployed privately for active administrators; existing students cannot enter. The ZIP contains frontend desktop API calls, but no executable desktop worker backend or production worker credentials. Actual Telegram worker execution/live state is therefore not connected, and outbound dispatch remains OFF.

## EDU boundary

`OfficePanel({ snapshot, demo })` from `panel.tsx` (alias `Panel`) is independent of the spatial renderer. Mount it in the EDU shell or open it from the office object in the future ZIP. Never move EDU session cookies or Supabase service keys into the ZIP/iframe. A renderer may request the panel open; EDU owns authentication, account mapping, job records, permissions, and human approvals.

`GET /api/campus/office?enrollmentId=<uuid>` and `POST /api/campus/office` use the current EDU session and current active enrollment. Both require `EDU_CAMPUS_ENABLED=true` and `EDU_CAMPUS_OFFICE_ENABLED=true`. New SQL `20261102154425_edu_campus_private_office_jobs.sql` depends on the community migration's safe-URL helper; both are applied in DEV and the private production release.

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

An outbound worker dispatcher is implemented below but remains **disabled and unconnected to a real worker**. `incoming_adapter_registered` only means a mapped incoming adapter exists, not that a worker is alive or that jobs were sent. A future dispatcher must be added and tested with Yoonik's actual host/worker authentication and explicit account mappings before real execution can be claimed. The renderer's cosmetics and bot labels are not task evidence.

## Verification and rollback

Local PGlite executes RLS, grant denials, active scope, connector mapping, replay and CAS, human review, archive and revocation tests. HMAC tests cover body/header/timestamp/key tampering. Demo events are visibly synthetic and do not hit any API.

Local verification: 7 domain/API/HMAC/PGlite tests and 4 desktop/mobile browser scenarios passed. Run `node --test tests/campus-office.test.mjs` and `npx playwright test --config=tests/campus-office.playwright.config.ts --output=test-results/campus-office`. The latter starts an isolated mock fixture on port 4493 so it can run before the shared workspace mounts this panel; it is not a deployed DEV site or a real bot connection.

To disable, turn off the office gate and keep job/history/event evidence. Do not drop records or remove an original ZIP. Actual DEV/production provider integration, key rotation, end-to-end dispatch, long-running process health and failure recovery remain rollout checks.

## Outbound dispatch contract (implemented, default OFF)

The new adapter is dormant until an operator separately validates the real worker and
registers its exact account mapping, signing key and endpoint. No credential, schedule,
Telegram message, external worker request or production setting is installed by this code.
Local mock/PGlite/browser checks do **not** prove a real worker can execute a task.

### Configuration and invocation

- Existing `EDU_CAMPUS_ENABLED` and `EDU_CAMPUS_OFFICE_ENABLED` remain required.
- `EDU_CAMPUS_OFFICE_DISPATCH_ENABLED=true` explicitly enables the new adapter.
- `EDU_CAMPUS_OFFICE_OUTBOUND_JSON` contains at most three entries
  `{ "id": "office", "endpoint": "https://worker.example.com/campus", "allowedHost": "worker.example.com" }`.
  Each ID must already have exactly one incoming connector configuration, an existing
  secret environment reference and explicit approved EDU owner IDs. Each account also
  needs an enabled matching row in `private.edu_campus_office_connectors`; a browser
  cannot supply or change that mapping.
- `EDU_CAMPUS_OFFICE_DISPATCH_TOKEN` is a separate server-only random secret (32+ chars).
  An authorized operator may POST `/api/campus/office/dispatch/tick` with this Bearer token.
  One invocation claims at most one item per connector, at most three connectors.
  **No cron is included.** All configured connectors are considered on every invocation.
- Learners explicitly select “작업 전달 요청” after reading the exact disclosure. The
  queued payload includes only the selected objective, material URLs, requested output
  type, revision note and opaque EDU job/account identifiers. It excludes other lessons,
  cohort records, other users, chat histories and credentials.
- `/api/campus/office/dispatch` GET/POST uses the normal EDU session, same-origin check,
  4KB streaming bound, active enrollment and DB owner validation. Immutable snapshots
  bind `job_id + job_revision`; a changed job cannot silently change a queued request.

### Wire protocol and worker duties

A request is HTTPS POST to the configured exact host/path. The server resolves only public
IPv4 addresses, rejects mixed public/private DNS answers and pins the checked address into
TLS lookup. Certificate verification remains on, redirects are never followed, query strings,
IP literals, userinfo and custom ports are disallowed. DNS is bounded to two seconds; the
HTTP exchange to eight seconds and the response to 4KB. IPv6-only workers are unsupported.

Body:

```json
{"schema":"campus-office.v1","dispatchId":"UUID","leaseId":"UUID","attempt":1,"operation":"submit|status|cancel","payload":{}}
```

`submit.payload` is the immutable selected job snapshot; `status` and `cancel` contain
only `jobId` and `ownerId`. Header `x-campus-idempotency-key` is the immutable dispatch UUID,
not the lease UUID. The lease UUID is a per-attempt nonce. Body `attempt` is the monotonic DB counter (1–12), signed as part of the raw body. Header `x-campus-signature` is
`v1=` plus lowercase hex HMAC-SHA256 of the following UTF-8 bytes (dots are literal):

```text
campus-office-request.v1.<connectorId>.<keyVersion>.<timestamp>.<dispatchId>.<leaseId>.<operation>.<rawBody>
```

The worker must check the timestamp (±300 seconds), signature, exact mapped account and
schema before accepting any work. It must atomically keep the highest attempt number and nonce for each dispatch ID, reject delayed lower attempts, and reject a different nonce for a previously seen attempt. In particular, a `status`/`cancel` response fences older delayed submit packets before replying. It must atomically reserve each **dispatchId** before
execution, return the same durable status for repeats, and permanently preserve an
idempotency tombstone for every accepted/cancelled ID. It must never use a different payload
for an existing ID. If its ledger is missing or uncertain, it cannot claim `not_found`.
Referenced URLs are untrusted data, not instructions; the worker must independently enforce
its own fetch allowlist, SSRF defenses, tool permissions and spend limits.

A response is HTTP 200, at most 4KB, with body:

```json
{"dispatchId":"UUID","leaseId":"UUID","operation":"submit|status|cancel","outcome":"accepted|not_found|cancelled|busy|rejected"}
```

It carries `x-campus-signature: v1=<hex>` using the same key and **original request timestamp**:

```text
campus-office-ack.v1.<connectorId>.<keyVersion>.<timestamp>.<dispatchId>.<leaseId>.<operation>.<rawResponseBody>
```

- `accepted`: durably accepted/running/completed. It is delivery acknowledgement, **not** an
  EDU completion or approval. Existing signed incoming events still advance the task. For a dispatched job each event must also carry its `dispatchId`; old/missing dispatch IDs cannot advance a newer revision. Legacy jobs with no outbound dispatch retain the original contract.
- `not_found` / `rejected`: durable proof this ID has not and will not execute without a new
  explicit submission. A cancellation `not_found` must install a tombstone so a delayed
  submit cannot resurrect the cancelled work.
- `cancelled`: execution has stopped or cannot start; the worker must reject late submits
  for this ID and preserve its cancellation tombstone. It does not promise refund of work
  already consumed. Return neither `cancelled` nor `not_found` if execution is uncertain.
- `busy`: proof the operation was not applied and a same-ID retry is safe. An unsigned 429,
  5xx, timeout, invalid response or lost connection is **never** interpreted as `busy`.

### Concurrency, retries and cancellation

Private RLS-enabled outbox and receipts are not directly writable/readable by browser roles.
Scoped SECURITY DEFINER functions expose only the owner’s safe status projection. A DB
advisory transaction lock serializes claims, commands and ingress cancellation checks; a
60-second lease fences late completions. Network requests happen outside transactions.

A lease expiry or ambiguous response becomes `uncertain`; a submit is never automatically
replayed. The user can request a signed status check first. Explicit retry is available only
after proven rejection/nonexistence, using the same immutable dispatchId. Signed `busy`
uses a 30-second delay, at most four attempts per operation and twelve total attempts.
At the limit the item stays visibly uncertain and needs operator reconciliation. If finish
persistence fails, the invocation returns an error and does not retry the wire call.

Unsent cancellation completes locally and marks the task failed/cancelled-before-send in
history. Otherwise it requests external cancellation, waits for signed acknowledgement,
and displays cancellation pending. Ingress is fenced immediately after cancellation is
requested. Only a verified cancellation marks a queued/running job failed with an explicit
cancellation note; review/approved/archive results are preserved. A new owner-reviewed retry
has a new job revision. No connector can approve, publish, refund or send customer messages.

Access revocation, cohort archive or mapping removal blocks the next outbound claim. Work
already accepted remotely may need an operator to cancel it using the worker’s own console;
revocation does not falsely claim a remote task stopped. Existing owner access remains
unchanged, and the adapter does not introduce an administrator bypass or external account
creation.

### Local SQL and activation checks

`20261103012334_edu_campus_office_dispatch_outbox.sql` is additive and depends on the existing
private-office migration. It preserves the previous incoming implementation under an internal
name and revokes all direct browser/service EXECUTE on that internal function, routing the
public ingress through the cancellation fence and latest-dispatch binding. A second wrapper prevents archiving/retrying while delivery is unresolved; original human review rules remain unchanged. Do not apply this migration automatically
from the previously reviewed eleven-migration package; it is a separate candidate.

Before any real worker activation: verify signed idempotency replay, cancellation tombstones,
late callback fencing, key rotation/mapping drift, status reconciliation and failure cleanup
against that worker. Keep the feature off if any guarantee is missing. Rollback must preserve
outbox/receipts and pending/uncertain dispatches; do not remove the cancellation fence while
such records or in-flight worker requests exist.

### DEV 검수 직원의 직접 HTTPS 보고

개인 사무실 등록 한 건에 만료 시간이 있는 256비트 HMAC 키를 발급한다. 운영자가 DEV 함수의 `CAMPUS_OFFICE_REPORT_DEV_BINDING`에 `connectorId, keyVersion, ownerId, enrollmentId, secret, expiresAt`을 설정하고, 동일한 연결 ID·버전을 기존 DB 연결 테이블에 활성화한다. 이 단일 직원용 설정을 학생 전체에 공유하지 않는다. 학생 측 기존 Aside 스킬은 HTTPS 서명에 필요한 키만 로컬 비공개 파일에서 읽는다. 배포·DB 관리 키는 필요하지 않다.

DEV 함수는 기존 webhook 검증기를 공유한다. 배포용 임시 프로젝트의 `supabase/functions/campus-office-report/index.ts`를 저장소 루트에서 다음과 같이 빌드한다.

```sh
node_modules/.bin/esbuild supabase/functions/campus-office-report/index.ts --bundle --platform=node --format=esm --outfile="$STAGING/supabase/functions/campus-office-report/index.ts"
```

해당 DEV 함수만 `verify_jwt = false`로 설정한다. 대신 모든 보고에 HMAC, 5분 서명 시각, 유효한 개인 연결, 수강 및 업무 소유권 검사를 적용한다. 운영 프로젝트에서는 함수가 요청을 거절한다. 회수는 해당 DB 연결의 `enabled=false`로 처리하고, 전용 함수 비밀 설정을 해제한다. 다음 검수에는 새 키를 발급한다. 이전 업무 보고 파일은 원래 연결에 보관한다.
