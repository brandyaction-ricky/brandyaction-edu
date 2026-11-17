# TIPS synthetic DEV source review

Current native source facts are checked immediately before a mock delivery.
The endpoint always returns review_only/deliveryAllowed=false and has no sender.
Only dedicated seven-day hashed keys and example.invalid synthetic identities
are accepted. Keys and fixture identifiers are excluded from Git.

This DEV release is additive to the source version already serving the DEV URL.
No production release, provider payment/refund, real delivery or ad spending.

EDU validates current consent, purchases/refunds, cohort and learning access.
MYIN validates current consent, the synthetic native purchase and diagnosis.
MYIN has no course cohort concept. Its review endpoint is DEV synthetic-only.

Local source tests/build passed. MYIN full typecheck reports existing generated
database type errors outside this change; the new review module has no new
reported type errors. Remote HTTPS and TIPS queue tests are recorded separately.
