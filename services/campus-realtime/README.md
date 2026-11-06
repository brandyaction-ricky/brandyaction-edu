# Campus event gateway — DEV connection candidate

The 3D scene and EDU checkout/class APIs remain separate from this realtime process. No process is automatically started by Next.js. The production service is unchanged. A private DEV-only review route can opt in to a separately configured gateway.

## Implemented boundaries

- A room holds at most 25 sessions; new sessions and room changes both receive server-assigned partitions, initially filling to 20 to reserve five places for nearby joins.
- Admission ceiling is 1,600 sessions including pending authorization reservations. Excess joins return 503 with Retry-After; the scene remains usable without peers.
- 500 ms latest-state broadcasts only for changed partitions, with full-count refresh every 2 s. Appearance is sent on change/reconnect rather than every movement. Movement is never written to the EDU database.
- Per-session request bucket, 4 KiB request body bound, 64 KiB slow-consumer send-buffer bound, idle lease expiry, 15 s reconnect grace, 15 minute default hub authorization lease; the dedicated server uses 90 seconds and requires fresh authorization every 60 seconds. Reconnection does not create a duplicate session.
- Offices are private partitions. Room authorization uses trusted claims. Client-supplied role is accepted ONLY by the synthetic test fixture.
- Dedicated gateway verifies signed, event-scoped, single-use, short-lived admission tickets. The exported issuer MUST be called by a trusted EDU server after checking current event/access rights. It must never accept a client-provided student/admin role.
- Local browser: max 12 nearest remote avatars on phones / 24 on desktop, stable selection, at most 30 active draws/s on coarse-pointer devices, capped pixel ratio, hidden page suspension, 8 s request timeout, exponential reconnect jitter (5 attempts) then manual retry. Full room count remains distinct from rendered character count.

## Connection-backed crowd and nearby conversations

- Only connected visitors in the public live room enter the crowd snapshot. Private rooms, names and messages are excluded. Snapshots refresh at most every 2 seconds during steady state, with at most 80 sampled remote people per partition; no invented population.
- Phones draw at most 40 low-detail bodies, desktops 80, using eight shared instanced meshes. Detailed avatars stay at 12/24. A participant is never rendered in both tiers. Distant figures preserve position/height and coat/hair/skin color; existing detailed characters remain unchanged.
- Approaching within 3.5 metres reveals a join action. Server checks live room, actual latest proximity (4 metres including floor height), group capacity and cooldown. Joining changes the conversation partition without teleporting. Leaving a conversation creates an independent group; private-room permissions do not change.
- Counts are active connections, not deduplicated humans. Synthetic local QA sessions are prominently labelled and excluded from the displayed non-synthetic count. `crowd-demo.mjs` connects 60 labelled local-only clients to the separate fixture on port 4563. It must never run against a production endpoint.
- Group chat stays within its partition. Switching groups clears the switching member's previous message; public crowd packets never contain chat or names. Revocation/internet deployment gates below still apply.

## Local mobile rendering QA

- Static atrium meshes are merged only when material and attribute layouts match. Actual transformed vertices, indices, normals and UVs are retained; geometry.type/parameters are not shape evidence for custom atrium geometry. Curved stairs/buildings are not substituted with boxes. Static transforms and settled crowd buffers are not recomputed each frame.
- Local marked QA visitors form spaced groups of 2–4, with four independently timed walkers. This choreography never repositions actual users. Shared demo groups correspond to their own conversation partitions.
- Preview-only DOM diagnostics report moving-frame FPS, CPU draw cost, draw calls and GPU backend without network logging. Software-rendered headless Chromium is not physical phone performance. Validate actual devices and sustained heat before deployment.

## What is NOT yet ready for a real event

1. Public-event admission and production browser binding are still disabled. The DEV-only endpoint checks a verified active administrator and the uncached published, unexpired event on every issue/renew; even administrators receive guest room rights. Implement public admission policy and edge bot/rate controls before accepting public traffic.
2. Event deployment, exact HTTPS origin/CORS and reverse-proxy streaming configuration, signing secret registration, regional placement and contracted quotas/costs. No keys/accounts/paid infrastructure were created.
3. This version is a single event process with bounded in-memory partitions. It is NOT distributed Durable Objects or multi-instance autoscaling. Do not deploy multiple replicas behind random load balancing: sessions would be routed to the wrong process. A room-owner router / shared coordination is needed for horizontal scaling and high availability.
4. Real deployment 500/1,000/1,500 connection testing for 30+ minutes, launch burst, disconnect/restart/reconnect, slow clients, mobile networks and device FPS/heat. Loopback results do not prove production capacity.
5. Direct friend invitations and global instructor announcements are not implemented; nearby group joins are implemented in the local candidate. Private-room access remains protected.

## Run isolated checks

- `node --test tests/campus-capacity.test.mjs tests/campus-preview-meetup.test.mjs`
- `node tests/campus-fixture/capacity-load.mjs 500 15` (repeat for 1000 / 1500; fixed loopback target only)
- Existing fixture: `CAMPUS_QA_PORT=4555 node tests/campus-fixture/server.mjs` then `/webinar?meet=1`.

## Dedicated deployment entry point

`node services/campus-realtime/server.mjs` requires CAMPUS_REALTIME_SIGNING_SECRET (>=32 bytes), CAMPUS_REALTIME_EVENT_ID, and CAMPUS_REALTIME_ALLOWED_ORIGINS. Host defaults to loopback. No secret values belong in Git or logs. The service rejects unsigned joins and ticket replay. Do not expose the synthetic fixture to the Internet.

Acceptance targets for deployment QA (not measured achievements): 1,000 active sessions + 1,500 headroom; zero cross-partition/private-office exposure; >=99% successful admissible joins; join p95 <3 s; movement delivery p95 <1 s; recovery without duplicate counts; no sustained memory growth; normal phone interaction near 30 FPS. Overload must preserve browsing and course/contact links.


## Private DEV review

- Page: `/campus/realtime-review/<event-slug>`. Ticket route: `POST /api/campus/realtime-admission` with `{ "slug": "<event-slug>" }`. The existing public webinar page retains its current transport. Review activity collection is disabled.
- Next server settings: `EDU_CAMPUS_REALTIME_DEV_ENABLED=true`, the existing verified DEV Supabase URL, `CAMPUS_REALTIME_ENDPOINT` (full HTTPS URL ending in `/api/campus/realtime`), `CAMPUS_REALTIME_EVENT_ID`, and a new dedicated `CAMPUS_REALTIME_SIGNING_SECRET`. The gateway uses the same event/secret plus exact `CAMPUS_REALTIME_ALLOWED_ORIGINS`. Never reuse a database/service-role key as this secret.
- The enable flag cannot activate against the production database. Local HTTP endpoints are accepted only for loopback when Next runs in development mode. Hosted review requires HTTPS.
- Account verification uses `getAuthenticatedUser()` (Supabase `auth.getUser()` and active database profile). Each ticket is single use, event scoped, and valid for 60 seconds. Renewal must retain subject/event/role. Heartbeats and SSE reconnection cannot extend the 90-second authorization lease. Event closure/account revocation stops new tickets; an already authorized connection expires within at most 90 seconds after its last successful renewal.
- Browser transport keeps credentials in memory, sends no EDU cookies to the gateway, resumes the existing connection during reconnect grace, and uses at most five retries per outage. Hidden tabs leave; returning tabs reauthorize. Gateway failure leaves the surrounding tour usable. The initial adapter displays the assigned partition (up to 24 peers); cross-partition crowd rendering is not yet bound to this review adapter.
- Reverse proxies must preserve SSE streaming, disable buffering, and redact query strings from request logs (the SSE URL contains a session credential). Never route sessions across arbitrary replicas.

## Isolated remote-host QA

Start the signed `server.mjs` on an unused loopback port in a separate directory on the development host, with a temporary dedicated secret. Forward that port over SSH; no public tunnel, production worker change, or host-wide configuration is needed. The service imports `hub.mjs`, `tickets.mjs`, and `public/campus/world/tour/atrium-layout.mjs`.

For the browser fixture, use loopback port 4586 and set:

```
CAMPUS_QA_PORT=4586
CAMPUS_QA_GATEWAY_URL=http://127.0.0.1:8787/api/campus/realtime
CAMPUS_QA_GATEWAY_SECRET_FILE=<private temporary file>
```

Then run `node tests/campus-fixture/server.mjs` and open `/webinar-gateway`. The fixture explicitly uses synthetic account/event dependencies and does not access a DEV or production database. Its issuer/status switches exist only in this opt-in loopback fixture. This is not proof of real DEV-login acceptance.

- Unit/security: `node --test tests/campus-realtime-admission.test.mjs tests/campus-realtime-renew.test.mjs tests/campus-capacity.test.mjs tests/campus-preview-meetup.test.mjs`
- Actual browser/remote gateway: `CAMPUS_GATEWAY_BROWSER_QA=true node --test tests/campus-realtime.browser.mjs` (requires the services above; desktop and mobile viewport, not a physical phone).
- Finish by stopping the fixture, forwarded connection and dedicated remote process, then removing only the temporary signing-secret files. Do not modify existing rendering/automation workers.
