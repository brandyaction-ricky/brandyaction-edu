# Support tool dimensions — additive candidate

Adds an optional tool kind/name to learner support requests and a per-tool administrator comparison. Existing requests remain explicitly unclassified. The private question body is never mined to guess the tool. Preset names are normalized, and custom names remain bounded. The new view combines equal normalized names within the same kind across lessons, compares the last seven days with the preceding seven days, and counts unique requesters for the current period. It also names the related lessons and includes these aggregates in the existing retrospective download.

## Runtime and compatibility

- Student: `/campus/workspace` → 문샷 지원실 → 도움 요청 → 사용 중인 도구 종류 / 도구 이름.
- Student history and the operator request detail retain the selected tool.
- Administrator: `/admin/campus/operations` → 지원·모임·AI 사용량 → 막힘 지도·회고 → 도구별 반복 막힘.
- Existing API `POST /api/campus/support` `kind:intake` accepts optional `toolKind`, `toolName`; omitted values mean `unspecified`, `''`. No event shape changes.
- Stored columns `tool_kind`, `tool_name` have bounded check constraints. Existing SELECT/INSERT grants and owner/scope RLS remain unchanged. No new grants, definer functions, trigger or scheduled tasks.
- Additive migration must be applied before the new code. Older code continues writing rows using the defaults. The exact original eleven migrations are not edited.
- This local candidate does not apply SQL to DEV or production, publish code, send messages, or call AI.

## Apply review and rollback

Migration: `supabase/migrations/20261103012413_edu_campus_support_tool_dimensions.sql`.

Before a separately coordinated application, capture column definitions, table constraints, grants/policies and counts for `edu_campus_support_requests`, confirm both new columns and constraints are absent, and validate the migration SHA. Apply only this new migration transaction. Lock timeout is three seconds and statement timeout is thirty seconds; failure must leave the previous schema unchanged. Reapply is intentionally not silently ignored: the normal migration ledger controls exactly-once application.

Preferred rollback: restore the prior application commit and leave additive columns/data intact. If schema removal is required, `rollback.sql` takes an exclusive lock and refuses to remove any selected tool/name evidence. Do not bypass that stop or delete evidence to satisfy it. It does not touch requests, existing policies/grants or other features. Coordinate a schema rollback with later consumers first.

## Verification

`tests/campus-support-tools.test.mjs` covers old payload compatibility, normalization/validation, cross-lesson aggregates, unique learners, previous-period/out-of-window records, no private-body inference, real handler/repository save/reopen/retry/ownership, and additive PGlite schema/constraints/RLS/rollback.

`tests/campus-browser/support-tools.spec.ts` covers desktop/mobile select→save→history, legacy visibility, failure retention, type change, operator filtering and individual request context. The fixtures have no remote side effects.
