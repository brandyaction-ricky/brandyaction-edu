# Prepared DEV Auth · Storage · Realtime smoke

This is an inert, importable test runner, not a deployment or provisioning command. Running `04-network-smoke.mjs` directly prints `prepared-not-executed` and performs no network access. Local mock tests do not establish real Auth, Storage, browser or Realtime success.

The target is the explicitly verified EDU DEV project and DEV app origin. Production, real learners, payments, AI calls, bot dispatch and customer notifications are outside this runner. Actual account IDs, state snapshots, trigger/rule evidence, generated provisioning SQL and cleanup ledgers belong in private operator artifacts, not this public document or repository.

## Safety conditions before execution

- Check the fixed deployment source SHA, actual Supabase project, required migrations and feature flags. A URL containing “dev” is insufficient proof.
- Review ordinary Auth/profile/enrollment triggers and active CRM, notification and integration rules. An invalid email, internal-account flag or marketing opt-out alone does not prove notification isolation. Never disable a shared trigger or queue worker to pass a test, and never rely on deleting queued messages after they become visible to a worker.
- Provisioning is separate and must have exact-ID state comparisons, collision checks and independent recovery instructions. An existing synthetic-account path can avoid signup triggers when the current metadata supports that conclusion. Do not reactivate or move an original enrollment; create only the reviewed synthetic course/cohort/enrollment scope.
- Verify the app's `private:true` contract and SQL Realtime authorization. `realtimePrivateChannelsReviewed:true` records that review, **not** a claim that the provider's global public-channel setting was read. If that setting is unavailable, the actual synthetic public/anonymous probes below remain required. A failed or inconclusive probe stops employee QA activation.
- Keep any service credential inside the private operator process. The network runner accepts only a public/anon key and ordinary learner sessions. No secrets, cookies, token hashes, signed URL queries or raw provider exceptions may be logged, saved or supplied as shell arguments.

## Bounded synthetic artifacts

The fixed namespace is `f04c2026-1103-4000-8000-` and the fixture label is `campus-network-qa-20261103`.

| Artifact | Namespace suffix | Bound |
|---|---|---|
| Course | `10` | One synthetic, published course excluded from the catalogue |
| Cohorts | `20`, `21` | Two synthetic scopes, closed for recruitment |
| Enrollments in reuse mode | `31`, `32` | Owner and peer; only the new peer enrollment changes phase |
| Portfolio | `500` | One private post initially |
| Screenshot | `501` | One generated 1×1 PNG |
| Sharing request IDs | `502`–`507` | Explicit sharing and withdrawal only |
| Space sessions | `600`, `601` | Owner and peer |

Full UUID suffixes are zero-padded to twelve digits. Unlisted metadata is not private authorization: a direct detail URL may still expose the synthetic course's public metadata. No real course content or personal data belongs in this fixture.

The separate `fresh-four` mode uses fixture actor suffixes `1`–`4` and enrollment suffixes `31`–`34`. It is permitted only if a separately reviewed provisioning plan proves that creating those users cannot trigger external dispatch. The runner itself never creates users.

## Configuration and operator callbacks

Call `runDevNetworkSmoke(config, dependencies)` inside the private operator process after review. Required configuration includes:

- `execute:true`, exact `projectRef`, `supabaseUrl`, allowed DEV `appOrigin`, and `publishableKey`.
- `proof:{appProjectRef, fixture, sourceSha, verifiedAt, notificationIsolationReviewed:true, migrationChecksPassed:true, realtimePrivateChannelsReviewed:true}`. The proof expires after fifteen minutes. These assertions do not replace the underlying checks.
- Four roles in `actors:{owner,peer,otherCohort,refunded}`, each with `id`, `email`, `enrollmentId` and `cohortId`. Use invalid-domain synthetic addresses only.
- Mandatory `cleanupArtifacts(ledger)`, returning `{storageRemoved:true,qaAccessRevoked:true}` only after exact cleanup is verified. It also runs after partial failures. A failed cleanup makes the overall result fail.

For **existing two-account reuse**, also set:

```js
mode: 'reuse-two',
reuseActors: privatelyVerifiedTwoActorIds, // { owner: uuid, peer: uuid }
proof: { /* other reviewed fields */, existingQaMetadataVerified: true }
```

The owner uses its verified ID and new enrollment `31`. The peer, other-cohort and refunded roles are three isolated sessions of the same second QA account, using new enrollment `32`. These are sequential authorization phases, not four concurrent people. No password is provided in this mode. Unknown/mismatched IDs or a non-synthetic email fail before network I/O.

Pass `authenticateExistingQa:existingQaRecoveryAuthenticator(admin, privatelyVerifiedTwoActorIds)`. The adapter verifies the exact existing user and confirmed email, then uses `generateLink({type:'recovery'})` and normal SSR `verifyOtp({type:'recovery'})`. It does not send mail or call a password update. The magiclink variant is deliberately excluded because it may create a missing user. Recovery returns a missing-user error instead. Ordinary provider hooks and audit effects still require review.

Pass `transitionPeer({actorId,enrollmentId,expectedPhase,nextPhase,cohortId})`. This callback must perform a guarded, committed comparison-and-swap on only the new peer enrollment and return `{verified:true,phase}` after checking the result. Phases are `same`, `foreign` and `refunded`. The runner restores `same` before testing share withdrawal so a denied request cannot pass merely because the peer remained refunded. Never guess a new timestamp after a conflict.

For fresh-four mode, set `proof.freshActorsOnly:true` and provide generated passwords held only in memory. Any signup-trigger uncertainty keeps that mode unexecuted.

## What the explicit run checks

1. In reuse mode, anonymous reads of `/api/platform?view=classes&q=NETWORK QA ONLY`, `view=home` and the exact two `view=checkout&cohort=...` scopes confirm list exclusion, real fixture presence, `closed` cohort status and past recruitment dates. A fresh ignored `filter` cache key avoids accepting a pre-provision empty cache. This depends on the reviewed route's current cache/filter contract; re-review when the fixed source changes.
2. Normal Auth sessions produce SSR cookies in memory, and `getUser()` verifies each actor. An anonymous campus API request is denied.
3. The owner creates one private portfolio, inaccessible to the same-cohort peer.
4. The owner prepares the exact PNG through the app route, uploads to the returned **verified DEV bucket/path**, and asks the server to complete verification. Downloaded bytes must match. The client never follows a production or unexpected Storage URL.
5. Sharing the post alone leaves the file private. An unconfirmed file share fails. An explicit file share allows only the same-cohort peer; foreign, refunded and anonymous requests fail. Withdrawal and subsequent post-private conversion each stop new download links. Previously issued short-lived signed links and already-downloaded copies cannot be recalled.
6. Two actors join the space API. A private Realtime topic delivers a synthetic movement message to the peer. Authenticated-public and anonymous-public probes for the same topic must not receive it. Foreign/refunded and anonymous private joins must return the documented read-permission denial. A generic `CHANNEL_ERROR`, expired JWT, server error or timeout is **inconclusive/failure**, not authorization evidence.
7. Every channel removal must return `ok`; `finally` also disconnects every authenticated and anonymous socket and verifies the closed state. Timeout/error is cleanup failure, even when the artifact cleanup succeeds. Sessions leave/sign out, and exact cleanup runs in `finally`. Only reviewed synthetic state is revoked/restored. Storage files must be removed through Storage API; never mutate `storage.objects` directly or empty a bucket.

The runner reports stage labels and booleans only. It does not automatically retry, issue new keys or fall back to live data. A process killed before `finally` still requires the operator's independently retained recovery ledger.

## Optional browser check before cleanup

`verifyBrowser({actors,artifacts,getCookies})` runs after network checks and before cleanup. Cookies are for fresh in-memory browser contexts only. Return `{corsVerified:true,uiVerified:true}` only after actual browser observations; otherwise `realBrowserCorsTested` stays false or the run fails.

This callback may preview/download only the exact existing PNG. It must not create an untracked second attachment. To measure browser upload CORS within the one-object budget, the operator can provide a `dependencies.fetch` adapter that performs this same signed PUT/download from a real DEV-origin browser during the main flow, then report its observed result in the callback. A separate file-input upload requires its own bounded artifact and cleanup contract.

Browser follow-up should check the real connected UI, course selection, the stored attachment, peer movement, disconnect/rejoin and accessible controls. Never report mocked traffic, a demo badge, or API-only success as browser CORS/UI verification. This test does not establish high-concurrency capacity or large-file performance.

## Sources and local validation

The existing-user recovery distinction follows the official [Auth link handler](https://github.com/supabase/auth/blob/master/internal/api/mail.go), [verification handler](https://github.com/supabase/auth/blob/master/internal/api/verify.go) and [Admin generateLink documentation](https://supabase.com/docs/reference/javascript/auth-admin-generatelink). Realtime checks follow the [authorization documentation](https://supabase.com/docs/guides/realtime/authorization) and [channel handler](https://github.com/supabase/realtime/blob/master/lib/realtime_web/channels/realtime_channel.ex). Reading these sources does not prove a deployed provider version or environment setting.

Run `node --test tests/campus-dev-network-smoke.test.mjs` for local mocks covering inert entry, unsafe-target rejection, exact Storage flow, cleanup on failure, reuse phases, existing-user authentication, explicit Realtime-denial classification, catalog isolation and the optional browser callback. No deployed actor, credential or environment evidence is included in those tests.
