# Kakao-only reward deployment operations

These are explicitly selected deployment scripts, not automatic migrations. Do not run `db push --include-all`: pending migrations include legacy-consent retirement and unrelated work. No script has been applied to production as part of authoring this candidate.

## Production preflight (read only)

Expected baseline: application `580585f4fc03312e00bfb2e23e2a8728e4203ec1`, Supabase `qitqxizuwmmlhlcgsrqe`. Confirm again immediately before execution. Confirm `edu_account_consent(uuid,uuid,jsonb,text,text,uuid)`, `edu_personalization_terms`, and `edu_consent_reward_config` are absent. Stop on changed state; never overwrite a newer RPC or replace an existing coupon campaign. Confirm the selected coupon UUID/code are unused.

The original `20261007011925_edu_optional_consent_e6.sql` retires all unconverted legacy marketing consent immediately when applied. It is NOT part of this early-coupon deployment; the previously agreed retirement remains a separate cutoff operation. Do not mark that migration as applied after running the bootstrap.

## Separately approved DB preparation, exact order

1. `edu_optional_consent_pre_retirement_bootstrap.sql`: one-time prerequisite schema/RPC, no bulk profile updates. Fails if the account-consent RPC exists. Untouched legacy members keep current behavior. Their old consent remains visible/revocable via `legacyActive`; an explicit new setting replaces only that member's old setting. Converted/retired members cannot be opted back into legacy consent by stale clients. The original retirement migration later replaces this transitional guard with its strict guard.
2. `../migrations/20261008074257_edu_personalization_consent.sql`: empty consent storage/functions only. NO terms rows or analysis grants.
3. `../migrations/20261008081424_edu_consent_reward.sql`: reward/config/receipts and wallet-only coupon quote guard. No awards.
4. `edu_consent_reward_campaign.sql`: approved ₩10,000 paid-course coupon, minimum 0, once/account, wallet validity 30 days, campaign disabled. No per-customer coupon issuance.

Every script is transactional. Keep exact checksums in the OS release record. Migration history must record only migration files actually applied through the approved migration mechanism; bootstrap/campaign operations are separate audited operations and must not masquerade as migration 20261007011925.

## Separately approved environment/code activation

- `EDU_OPTIONAL_CONSENT_ENABLED=true`
- `NEXT_PUBLIC_EDU_OPTIONAL_CONSENT_ENABLED=true`
- `EDU_CONSENT_REWARD_ENABLED=true`
- `NEXT_PUBLIC_EDU_CONSENT_REWARD_ENABLED=true`
- `EDU_PERSONALIZATION_CONSENT_ENABLED=false`
- `NEXT_PUBLIC_EDU_PERSONALIZATION_CONSENT_ENABLED=false`

Build public flags into the fixed source deployment. Keep campaign disabled until health/build verification. Then apply separately approved `edu_consent_reward_activate.sql`. It refuses mismatched campaign identity or any current analysis disclosure. No customer-level TIPS feed, overseas transfer, dispatch or automation is activated by these operations. Enabling optional consent also enables the already-present signup optional choices and profile withdrawal UI; include that in release approval.

Verification: actual deployed SHA and flags; signed-in /my card with ONE unchecked Kakao choice; profile settings and legacy withdrawal; analysis panel absent for members with no grants; no overseas terms in reward response. Actual coupon issuance requires an explicitly authorized operator/test account; never silently opt in a customer. Verify wallet validity, duplicate prevention, quote eligibility and withdrawal without coupon cancellation.

## Stop / rollback

- Before activation: leave campaign disabled; revert code to baseline if needed. Preserve additive schema.
- After activation: first set `edu_consent_reward_config.enabled=false`; disable both reward flags and redeploy while KEEPING optional-consent API/profile settings available for withdrawal. Preserve consent audit, issued wallets, requests and quote protection. Do not drop tables or restore the old quote function after any reward has been issued.
- Full code fallback to `580585f4fc03312e00bfb2e23e2a8728e4203ec1` is safe only before new consent/awards exist. Once there are new records, use the verified reward-OFF candidate instead; do not lose the new consent-withdrawal UI.
- No bulk legacy retirement is executed here. Later cutoff approval must explicitly include the original migration and its affected population.
