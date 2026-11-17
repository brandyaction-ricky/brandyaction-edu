# EDU catalog-code compatibility candidate

DEV readiness was checked read-only on 2026-10-12: 18 courses, 14 codes containing capitals, 4 passing the current lower-case-only v2 rule; 11 cohort pairs, only 1 passing exactly. Case-folding would make all formats pass in this DEV snapshot, but changes identifiers and is not the selected solution. Existing v1 uses the original course_code and course_code:cohort_code. Source codes, prices, orders and v1 exports stay untouched.

Broaden **only** product_id and cohort_code ASCII patterns from `[a-z0-9]` to `[A-Za-z0-9]`, keeping exact original spelling, maximum 80 characters and punctuation limits. `PRD-AB12` and `prd-ab12` stay distinct. Capture function validation and the EDU v2 schema change together. Consent version, privacy IDs, timestamps, cursor rules, gates and access grants are unchanged. Unknown/invalid source remains quarantined and the full page fails closed.

This is a correction to the unpublished EDU rc.2 candidate, not an automatic change to a TIPS-pinned schema. Before joint tests, TIPS must refresh its EDU schema/mirror to the exact new hash and confirm no implicit lower-case conversion in product/cohort keys. MYIN schema and identifiers are unchanged. The current shared DEV uses merge18089e2 and remains OFF; this candidate SQL is not applied. Do not present candidate uppercase support as a deployed service or reuse old test keys.

Synthetic checks cover uppercase payment/refund/learning, case-distinct products, invalid codes, and unchanged consent/private-ID bounds. Existing source/recovery tests remain. Full actual-catalog projection/real HTTP will be checked only after separate DEV code/SQL approval. Production and customer-level TIPS transmission remain OFF.
