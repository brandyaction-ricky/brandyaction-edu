# Public webinar entry integration

Implementation routes:

- `/campus/live/[slug]`: anonymous, cached public presentation, no anonymous Auth account, no curriculum or learner lookup on entry.
- `/admin/campus/webinars`: existing EDU marketing permission; per-event private `site_settings` config, optimistic revision checks, no migration.
- `/api/campus/webinar/[slug]/access`: uncached, verified EDU identity + current cohort enrollment. Does not grant a capability; `/campus/workspace` and its APIs retain independent checks.
- `/api/campus/webinar/[slug]/events`: bounded same-origin, six anonymous action types carried in `metadata.webinar_action`; existing permitted `page_view`/`click` names are used, preserving the database constraint. Existing `edu_record_event` operator tracking switch and rate guard apply. Never records a purchase from a browser click.

A published event requires a published course and its actual cohort/detail slug. Pausing invalidates the public cache; existing public tabs may remain visible, but a new access request reads the latest uncached status. Public output has no member data. Checkout uses EDU's existing offer/price/payment validation; this module never charges or creates orders. Future-start enrollments go to existing My Classes; a new welcome room is not implemented here.

## Yoonik ZIP boundary

Keep 3D rendering separate. Space clicks should call the host's access flow rather than decode URLs or accept client claims. Rendering code must not receive Supabase keys, cookies, Telegram tokens, another member's tasks or private curriculum. The public renderer gets public event metadata only. Adding an iframe or separate-origin app still requires a dedicated validated messaging/identity protocol; a UI `member` response alone is not authentication.

Demo NPCs must be visibly labeled and excluded from attendee, engagement and conversion statistics. This implementation displays no crowd/online count. Instructor voice, public chat, bot invitations and multi-user movement await the returned ZIP and realtime transport review.

## Capacity design and release gate

Entry uses ISR/public config caching, no private Realtime subscription, no full curriculum query. Video is loaded only on explicit play and delivered by YouTube, not proxied through EDU. Public CSS/JS interface works without 3D. Anonymous session refresh bypass is limited to exact public pages and bounded event ingestion; access/admin/private campus paths remain unchanged.

Existing private space capacity (24 peers) is not a hundreds-participant room. Before a public campaign:

1. Confirm event link, YouTube embed rights, current purchasable cohort, detail and Kakao channel with an operator.
2. Configure perimeter rate limits and provider quotas; the existing per-session DB limiter is not sufficient bot/DDoS protection because anonymous sessions can rotate.
3. Run a separate isolated DEV scenario: 500 sustained visitors and 1,000 entry burst, public entry + action packets + controlled entitlement lookups. No payment or production load. Measure CDN hit rate, p95 response, error rate, DB load, auth quota and video startup on mobile. Define acceptable thresholds and cost cap before the run.
4. Realtime crowd requires sectors/rooms, limited nearby avatars, aggregated real presence, backpressure and a 2D fallback. Do not broadcast every move to everyone. Load-test after real ZIP integration, not against this static preview.
5. Analytics are action counts over 30 days, not unique people/concurrent attendance/purchase conversion. Browser blocking, repeated tabs, rotated sessions and the existing two-second same-path click deduplication affect counts. Actual purchase attribution requires a separate server-confirmed order join.

## Local verification

- `node --test tests/campus-webinar.test.mjs`: validation, access boundaries, route authorization, CAS conflict/idempotency, telemetry restrictions.
- `npx playwright test -c tests/webinar.playwright.config.ts`: focused desktop/mobile UI.
- New specs also run in existing `playwright.campus.config.ts` CI shards.
- `node tests/webinar-fixture/server.mjs`: synthetic preview on `127.0.0.1:4496/webinar`, no real API writes or payment. Admin fixture requires mocked data in browser tests.

No real event is published by checking out this code. No production or shared DEV changes are part of local validation.
