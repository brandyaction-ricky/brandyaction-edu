# Winner event zone

- Admin: `/admin/campus/events` (existing marketing operator permission), also linked from the admin sidebar and campus management.
- Entry: `/campus/event/:slug?invite=:token`. The first successful authenticated claim binds the invitation to that account. Returning winners do not need the token. Tokens are stored only as SHA-256 hashes; do not log raw invitation URLs.
- Event files use the separate private `campus-event-assets` bucket. Downloads validate the current award and publication state, then issue a 60-second attachment URL.
- The existing active fixed-300000 coupon `1108` is selected; only its shared use deadline is updated by the explicit live-expiry field. New events default that field to 2026-11-08 23:59:59.999 KST. The event creates a fixed-100000 winner coupon scoped to the selected course. Only this registered pair can stack; winner eligibility is also restricted to the event cohort.
- Checkout reservations, payment completion, failures and refunds update both redemptions and wallets atomically. Amounts are calculated in SQL; the browser's displayed amount is never accepted as authority. A zero-discount second coupon is not consumed.
- Apply `20261105085527_campus_event_zone.sql` **before** deploying the application. It changes the redemption uniqueness constraint and shared coupon functions. Do not roll back those functions to single-coupon versions while stacked orders are pending. No remote migration or seed is run by the preview build.
- Configure future claim/use deadlines, upload materials, then enable the event and generate one invitation per winner. The existing live coupon's own eligibility and deadline still apply. Extending an event deadline does not retroactively extend already issued wallets.
- `node scripts/build-event-preview.mjs /tmp/event-review` builds an isolated visual review. All its data lives in browser localStorage, its login/upload/payment paths are simulations, and it has no service credentials.
- Tests: `node --test tests/campus-event-*.test.mjs`; `npx playwright test -c tests/campus-event.playwright.config.ts`; `npx playwright test tests/browser/coupons.spec.ts`.
