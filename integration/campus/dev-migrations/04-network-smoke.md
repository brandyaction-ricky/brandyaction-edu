# Prepared DEV Auth · Storage · Realtime network QA

**Prepared only; no actor creation, login, network smoke, upload or Realtime join has been executed by this author.** The rollback SQL in `03-transactional-qa.sql` cannot prove these network behaviors.

Target is only Supabase `vjmjhaidlqkmascdjocw` and a separately verified `brandyaction-edu-dev` deployment. Production, actual people, existing student work, paid AI, payment/refund, Telegram and customer notifications are excluded. The original 3D ZIP remains untouched.

## Before any persistent QA write

1. Complete the eleven-migration manifest/hash/postapply review and rollback smoke. Check the app deployment's actual Supabase project, source SHA and relevant feature flags, not merely a URL containing “dev”. Read the Realtime private-channel/public-access setting and retain a boolean-only proof; do not change a shared setting to pass QA. Do not turn on a shared production flag or replace any secret.
2. Run the SELECT-only `04-notification-preflight.sql`. Review `04-trigger-risk.md` and any previously unseen queue-side triggers/worker dependencies. No shared trigger, rule, worker or transmission setting may be disabled to make the test work.
3. A newly committed profile can enqueue `member_joined` and automatic tag events. **A reserved invalid email, `is_internal`, `qa_only` and marketing opt-out are not proven exclusions.** Creating a user then deleting its queues is too late if a worker claims them after commit. Proceed only after the event/rule/recipient path is shown unable to dispatch for these exact synthetic actors. Check enrollment insertion, revocation and account disable effects too. An Auth admin call does not send a confirmation email, but its ordinary database profile triggers still run.
4. Read the target Auth-hook configuration and existing notification worker eligibility using metadata/code only. Do not dump secrets, hook URLs with credentials, templates or customer records. If a required isolation rule is unknown, keep persistent provisioning and this script unexecuted; the local and rollback tests remain useful.
5. Verify every fixed namespace ID/email/course key below is absent. Any collision stops; do not reuse an unidentified account. Freeze a private, secret-free provisioning ledger and exact cleanup plan before creating the first record. Recheck the reviewed trigger hashes immediately before creation.

## Separate synthetic fixture

Namespace is `f04c2026-1103-4000-8000-`; it does not overlap the rollback `f03c...` fixture.

| Item | Suffix / value | Scope |
|---|---|---|
| Four Auth/profile actors | `000000000001` through `000000000004` | owner, same-cohort peer, other-cohort peer, revoked enrollment |
| Email | `campus-network-qa-20261103-{1..4}@example.invalid` | no phone, no real address or recipient |
| Course | `000000000010` | synthetic text only, hidden from catalogue |
| Cohorts | `000000000020`, `000000000021` | fresh synthetic A and B |
| Enrollments | `000000000031` through `000000000034` | first/second/fourth in A; third in B; fourth starts revoked/refunded |
| Portfolio | `000000000500` | owner only initially |
| Screenshot reservation | `000000000501` | generated 1×1 PNG, no person or customer information |
| Request IDs | `000000000502` through `000000000507` | sharing and revocation only |
| Space sessions | `000000000600`, `000000000601` | owner and peer |

Provision through the supported Auth Admin API only after the above risk gate. `createUser` can take the explicit UUID; use generated unique passwords held only in memory, `email_confirm:true`, `phone` absent, no invitation or OTP email. Do not write to `auth.users` directly for this persistent test. Create only these profiles/course/cohorts/enrollments, with ordinary reviewed triggers. A permission-closed course must still meet campus eligibility (`published` + hidden catalogue + active synthetic enrollment); check it is not unexpectedly discoverable in the catalogue. No live lesson/mission is needed for this network smoke.

The runner does not provision accounts or accept service credentials. The operator obtains existing authorized DEV credentials in memory, provisions the fixture separately, and passes only the public/anon key plus four synthetic credentials to `runDevNetworkSmoke`.

## Runner contract

`04-network-smoke.mjs` is importable. Running it directly prints `prepared-not-executed` and makes **no network call**. It intentionally has no `--run` CLI shortcut, environment credential loader or automatic account creator.

To execute after review, call `runDevNetworkSmoke(config, { cleanupArtifacts })` inside the operator's in-memory process. Required config:

- `execute:true`, `projectRef`, exact `supabaseUrl`, exact allowed DEV `appOrigin`, `publishableKey` (never service/secret key).
- `proof:{ appProjectRef, fixture:'campus-network-qa-20261103', sourceSha, verifiedAt, notificationIsolationReviewed:true, freshActorsOnly:true, migrationChecksPassed:true, realtimePrivateChannelsReviewed:true }`. The proof must come from actual reviewed checks; the runner cannot independently validate app environment settings. It expires after 15 minutes.
- `actors:{ owner, peer, otherCohort, refunded }`, each with fixed `id`, `email`, `enrollmentId`, `cohortId`, generated `password`. These objects must not be serialized, logged or placed in command arguments.
- Required `cleanupArtifacts(ledger)` callback receives only fixture IDs. It must return `{storageRemoved:true,qaAccessRevoked:true}` **only after exact cleanup is verified**; otherwise the overall smoke fails. It is also called after a mid-test failure. Caller retains its independent provisioning ledger if the process is interrupted before `finally`.

The runner builds normal Supabase SSR cookies in memory from real password authentication and checks each Auth `getUser()` identity. It sends those cookies to the actual campus routes with a matching Origin; it does not bypass app routes using service-role RLS. Raw API bodies, cookies, signed URLs, access tokens and exception objects are never returned or printed. Diagnostic output is stage labels and pass/fail checks only. There is no automatic retry, fresh-key issuance, or live-data fallback.

## Executed only when the runner is explicitly called

1. Real Auth password login + `getUser` for all four new actors; no-cookie app request is rejected.
2. Owner creates one private portfolio. Same-cohort peer cannot read it.
3. Owner prepares one screenshot through the real route, PUTs exact bytes directly to the **verified DEV bucket/path** using the returned signed URL, then calls completion. The actual server checks Storage info, MIME/signature and SHA-256. Owner download must return identical bytes.
4. Sharing the post alone must not share the screenshot. An unconfirmed file share must fail. A separately confirmed file share allows only the same-cohort peer; another cohort, revoked enrollment and anonymous request are denied.
5. Explicit file-share withdrawal stops new links. Re-sharing followed by setting the post private stops new links again. Already issued links remain possible for their 30-second TTL; downloaded copies cannot be recalled.
6. Two synthetic actors join the actual space API. The same private Realtime topic delivers one synthetic `move` message from owner to peer. Other-cohort and revoked actors must receive an explicit channel authorization error; a timeout is **inconclusive/failure**, never counted as denial. An authenticated other-cohort client and a separate anonymous client also try `private:false` with the exact same topic. Neither may receive the private message; then the anonymous private-channel join must be explicitly rejected. All channels are closed.
7. Leave space, sign out the QA sessions, remove only the exact created Storage object via Storage API, revoke QA access and verify cleanup. Keep safe audit rows/private evidence as needed. Do not mutate `storage.objects` by SQL, drop the bucket or delete existing records.

The script checks API and SDK network transport, not actual human browser CORS, viewport UX, camera controls, large file performance, or simultaneous learner load. It returns `realBrowserCorsTested:false` even after a successful run.

## Required browser follow-up

After the runner's isolated network check passes, use two fresh browser contexts with the same QA actors while the fixture remains available, or deliberately postpone final deactivation until this step. To avoid changing cleanup meaning, the runner currently requires deactivation; reactivate only those QA actors under the same reviewed provisioning plan before this follow-up, then deactivate again.

- Visit the real DEV URL, sign in, verify visible QA course selection and API connection status; no demo badge may be mistaken for live data.
- Upload the generated PNG from the actual file input; confirm browser CORS and return/download. Never attach a real screenshot containing user data.
- In separate QA windows, verify movement delivery, peer nickname, private-topic rejection, disconnect/rejoin and visibility changes; screenshots should contain only fictional QA aliases.
- If browser storage rejects a cross-origin URL, retain the console's sanitized error class and exact origin pair, not tokens or the signed URL query. Do not loosen production CORS or Storage RLS as a workaround.

## Cleanup / stop behavior

- Exact screenshot path is `<QA-owner-id>/<QA-post-id>/<QA-file-id>` in `campus-portfolio-private`; compare each component to the ledger before Storage removal. Keep metadata/audit rows if preservation is needed and close their access through QA enrollment/profile state.
- Revoke only the four QA enrollments and ban/deactivate the exact QA Auth/profile actors. Archive only the two QA cohorts and synthetic course after checking references; no cascade deletion.
- Ensure any local transaction failed cleanly before cleanup. Review new synthetic-only queued work and cancel only matching pending QA jobs with supported status transitions, if such rows legitimately exist. **Queue cleanup is remediation/evidence, not the primary notification safety gate.** A claimed or sent job triggers a stop and investigation.
- Never print service credentials, synthetic passwords, Auth sessions, signed upload/download query strings or raw responses. A failed final cleanup must be reported as unverified, even if the functional checks passed.

## Sources and local checks

The installed Supabase SSR/Auth SDK types and official [Admin createUser documentation](https://supabase.com/docs/reference/javascript/auth-admin-createuser) confirm the admin provisioning/email distinction. [Realtime authorization documentation](https://supabase.com/docs/guides/realtime/authorization) describes private-channel RLS and the public-access setting. Those documents do not prove the actual DEV configuration.

`node --test tests/campus-dev-network-smoke.test.mjs` runs local mock transports only: inert entrypoint/target/proof guards; full route and byte flow; cleanup on failure/production Storage rejection; private delivery and public/anonymous/foreign boundary sequencing. Passing these tests is not a real Auth/Storage/Realtime result.
