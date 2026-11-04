# Campus event gateway — local candidate, NOT deployed

The 3D scene and EDU checkout/class APIs remain separate from this realtime process. No process is automatically started by Next.js. Production and DEV are unchanged.

## Implemented boundaries

- A room holds at most 25 sessions; new sessions and room changes both receive server-assigned partitions.
- Admission ceiling is 1,600 sessions including pending authorization reservations. Excess joins return 503 with Retry-After; the scene remains usable without peers.
- 500 ms latest-state broadcasts only for changed partitions, with full-count refresh every 5 s. Appearance is sent on change/reconnect rather than every movement. Movement is never written to the EDU database.
- Per-session request bucket, 4 KiB request body bound, 64 KiB slow-consumer send-buffer bound, idle lease expiry, 15 s reconnect grace, 15 minute authorization lease. Reconnection does not create a duplicate session.
- Offices are private partitions. Room authorization uses trusted claims. Client-supplied role is accepted ONLY by the synthetic test fixture.
- Dedicated gateway verifies signed, event-scoped, single-use, short-lived admission tickets. The exported issuer MUST be called by a trusted EDU server after checking current event/access rights. It must never accept a client-provided student/admin role.
- Local browser: max 12 nearest remote avatars on phones / 24 on desktop, stable selection, at most 30 active draws/s on coarse-pointer devices, capped pixel ratio, hidden page suspension, 8 s request timeout, exponential reconnect jitter (5 attempts) then manual retry. Full room count remains distinct from rendered character count.

## What is NOT yet ready for a real event

1. EDU admission-ticket endpoint and production browser transport binding. Existing public webinar cached configuration/rights must gate issuance. Renew authorization before the 15 minute lease ends, and connect access revocation / event closure handling. Add edge bot/rate controls and abuse prevention before accepting public traffic.
2. Event deployment, exact HTTPS origin/CORS and reverse-proxy streaming configuration, signing secret registration, regional placement and contracted quotas/costs. No keys/accounts/paid infrastructure were created.
3. This version is a single event process with bounded in-memory partitions. It is NOT distributed Durable Objects or multi-instance autoscaling. Do not deploy multiple replicas behind random load balancing: sessions would be routed to the wrong process. A room-owner router / shared coordination is needed for horizontal scaling and high availability.
4. Real deployment 500/1,000/1,500 connection testing for 30+ minutes, launch burst, disconnect/restart/reconnect, slow clients, mobile networks and device FPS/heat. Loopback results do not prove production capacity.
5. Same-room invitation and global instructor announcements are not implemented. Private-room access remains protected.

## Run isolated checks

- `node --test tests/campus-capacity.test.mjs tests/campus-preview-meetup.test.mjs`
- `node tests/campus-fixture/capacity-load.mjs 500 15` (repeat for 1000 / 1500; fixed loopback target only)
- Existing fixture: `CAMPUS_QA_PORT=4555 node tests/campus-fixture/server.mjs` then `/webinar?meet=1`.

## Dedicated deployment entry point (prepared, not activated)

`node services/campus-realtime/server.mjs` requires CAMPUS_REALTIME_SIGNING_SECRET (>=32 bytes), CAMPUS_REALTIME_EVENT_ID, and CAMPUS_REALTIME_ALLOWED_ORIGINS. Host defaults to loopback. No secret values belong in Git or logs. The service rejects unsigned joins and ticket replay. Do not expose the synthetic fixture to the Internet.

Acceptance targets for deployment QA (not measured achievements): 1,000 active sessions + 1,500 headroom; zero cross-partition/private-office exposure; >=99% successful admissible joins; join p95 <3 s; movement delivery p95 <1 s; recovery without duplicate counts; no sustained memory growth; normal phone interaction near 30 FPS. Overload must preserve browsing and course/contact links.
