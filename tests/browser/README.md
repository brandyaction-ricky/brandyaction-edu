# Admin focus browser regression

Run `npm ci`, `npx playwright install --with-deps chromium`, then `npm run test:browser`.
The same command is a required step in the existing CI verification job.

The suite renders the real `LandingAdmin`, `AdminDrawer`, `AdminModal`, campaign
settings and actual-record forms. A small esbuild fixture serves synthetic GET
responses; it has no database or credentials and rejects writes. Only Next Link
navigation is substituted because routing is outside this focus regression.
The fixture is outside `app/` and is not a deployed application route.

Chromium projects cover desktop (1440×900), tablet (834×1112) and mobile
(390×844). These are viewport/touch emulation, not physical device tests.
React StrictMode is enabled to exercise effect setup/cleanup.

Each key assertion checks `document.activeElement` immediately after one Tab or
Shift+Tab. It must not accept BODY followed by recovery on a later key. Coverage:

- Campaign final active input and both disabled trailing actions
- Actual record add/edit drawers and their nested unsaved confirmation
- Sibling and DOM-nested confirm modals; only the top layer traps focus
- Disabled controls/fieldsets, hidden/display:none/visibility:hidden/inert,
  negative tabindex, and dynamically enabled last controls
- Escape, return to the opener, simultaneous parent/child close, and body scroll
  lock until the last dialog closes

Baseline: BA-ADMIN-FOCUS-001 was reproduced on develop 6ef9ec0 as
TEXTAREA → Tab → BODY → Tab → close button, and close → Shift+Tab → BODY.
