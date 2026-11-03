# 윤익님 공간 렌더러 연결

Source: `brandy-ai-office-handoff-20261103-full.zip` (2026-11-03).
Archive SHA256: `1b95991ac32cc8c747ea6b95bc57b2ebc1c304e189fbb319b2d9df48a6a70ab6`.

`vendor/` contains only selected rendering modules, optimized assets and the
original MIT / Three / Meshopt / Kenney licenses. `PROVENANCE.json` records the
original and imported hashes. The original ZIP and private extracted handoff
remain outside this repository.

Excluded: API/backend, Blob/Redis clients, upstream app entry point, snapshots,
local browser identity/progress/feedback stores, upstream privacy notice,
node_modules and the two large original audio recordings. Optimized audio is
preserved as an asset but is not automatically played or preloaded.

## Local patches to imported modules

1. `/assets/` URLs point to `/campus/world/office/vendor/assets/`.
2. `attachCampusNavigation` accepts `initialRoom` (defaults to `office`). EDU
   starts in `study` using that room's arrival coordinate and matching room ID.
   This avoids an initial invisible walk through the private office.

Keep these patches explicit when receiving a later handoff. Never replace the
EDU business logic with the upstream standalone `app.js` or storage backend.

## Ownership boundary

The existing EDU `SpacePanel` owns authenticated membership, profile, seat
reservations, private realtime transport, chat, lessons, feedback and progress.
The renderer only receives bounded display data through a same-origin iframe
channel. The random channel token is correlation, not an authentication token.
Do not put sessions, bot credentials, private notes or order data in messages.

The `bridge.mjs` adapter accepts the exact parent window, origin and channel
token. It has no HTTP API calls, external sockets or local identity storage.
Anonymous opening of its static URL starts no renderer and reveals no members.
Real access authorization remains at the EDU page/API/realtime boundaries.

Positions convert between study floor coordinates and the existing EDU 24×22
wire range. Private office positions are excluded. Changed positions are sent
at most twice per second, hidden tabs stop GPU rendering and movement messages,
and rendering quality degrades from measured load. At most 24 peer avatars are
shown. This is not a capacity result for hundreds of simultaneous users.

## Current integration

- Default space: original imported study space; existing ship remains a fallback.
- WASD/arrows/floor click/touch pad, map/third-person, profile and remote peers.
- EDU-reserved seats only; stand/wave; short-lived nearby speech.
- Focus/mission/feedback/lounge links open the existing EDU tools.
- Private-room button walks through the original room portal. The AI-office
  button opens EDU's private task inbox; no fictional active worker is shown.
- The original avatar preview, 12 GLB models, palette and held props are reused.
  Appearance drafts stay in the host; save uses the existing profile boundary.
  Cancel restores the saved appearance; personal notes and roles are excluded.
  Preview rendering stops when closed/hidden. No extra backend is introduced.
- Apply `20261103060120_edu_campus_original_avatar_appearance.sql` before deploying
  this code to an authorized DEV environment: five constrained cosmetic columns
  on each existing profile/presence table. No RLS/grant or membership changes.
  This migration has only been tested locally, not applied to DEV/production.

First-person, photo export and rocket animation remain in the existing ship.
The imported space labels this limitation. The upstream 3D private-office
geometry and assets are preserved, but rendering actual Telegram bots there
requires a verified owner-scoped bot catalog/status contract. The existing
EDU outgoing dispatcher remains OFF; no external task is executed by this UI.

## Checks and future merge

Run `node --test tests/campus-office-world.test.mjs` and Playwright's
`tests/campus-browser/office-world.spec.ts` with `playwright.campus.config.ts`.
Use the existing campus fixture for isolated UI testing. No shared DB is needed.

Next integration gates: actual owner-scoped bot catalog, signed worker task /
receipt round trip, actual authenticated DEV cross-account tests, and measured
multi-user load. Do not reinterpret local bot registration or an animated actor
as proof of a real Telegram task running or completing.
