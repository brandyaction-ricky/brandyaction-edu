# Campus activity contract (v1)

- Surface: `/admin/analytics`, section **문샷 캠퍼스 분석**.
- Server: `POST /api/campus/analytics`; admin report `GET /api/admin/campus/analytics` (marketing permission).
- Rooms: `live`, `welcome`, `study`, `office`, `library`.
- Fields: random batch UUID, random tab session UUID, public event slug or `member`, allowlisted action/room/target ID, active seconds by room. Member identity is taken from the authenticated server session, never the body.
- No message text, bot messages, names, credentials, arbitrary URLs or client-reported purchases.
- Transport: asynchronous 30–32 second batch, at most 32 actions and 35 active seconds; page-hide beacon; no movement-blocking UI state. No request per frame or per greeting.
- Dwell: visible page + input within 60 seconds, elapsed delta capped at 2 seconds. Idle/hidden periods excluded. Client delivery can be lost; this is engagement telemetry, not billing evidence.
- Server: origin validation, 10KB body limit, event configuration check/member authentication, DB idempotency by batch ID, six batches/session/minute, dedicated campus `edu_campus_analytics_settings.enabled` respected; default off, marketing operators control it in this panel; existing whole-site tracking remains unchanged.
- Metrics: session visits, room entries, actions, active seconds, average active seconds/room session, distinct intent sessions and room intent rate. Detail/consult/checkout clicks are intent, not purchases. Downloads and video opens do not prove completed saves/views.
- Retention: 90 days; hourly authenticated cleanup in chunks of 10,000 expired batches, oldest first. Aggregation stays in PostgreSQL and never silently samples a truncated row list.
- QA: domain allowlist validation, real PostgreSQL aggregation/deduplication/RLS tests, mobile report layout and empty states.
- Personal office: original Yoonik `BotOfficeModel` and `toBotOfficeSessions` schemas reused without changing character appearance. Owner-only persistence with revision conflicts; JSON import and account reload sync. Actual commands/results remain in each user's Telegram bot; registered presence does not claim a bot is working.
- Release: outside the exact DEV database, campus pages/APIs/admin paths require an active database `admin` role. Student campus entry UI is hidden. The production release remains private until a later reviewed code change opens it.
