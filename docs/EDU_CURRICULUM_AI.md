# Curriculum AI: technical setup and verification

The feature searches all eligible published lessons in the enrollment's course locally, then sends up to six relevant text excerpts to the Responses API. It does not fine-tune a model or upload a persistent curriculum file. Student access excludes locked lessons and unpublished cohort material. Draft lesson versions, learner submissions and quiz answer keys are excluded. Text retrieval does not read words embedded only in lesson images or downloads; the mentor's existing verified question-image loader remains supported.

## Gates and persistence

- `EDU_CURRICULUM_AI_ENABLED=true`: server routes and curriculum-backed mentor drafts.
- `NEXT_PUBLIC_EDU_CURRICULUM_AI_ENABLED=true`: student conversation and lazy admin usage panel. Other cohorts remain blocked by the server and can still use mentor questions.
- Existing question-hub, threads and bulk-draft feature flags retain their meanings. Enabling this feature does not enable them automatically.
- `OPENAI_API_KEY`: server-only Secret. `OPENAI_MODEL` defaults to `gpt-5-mini`.
- Migration `20261030064453_edu_curriculum_ai_and_usage.sql` creates three private tables and four service-only RPCs; it changes no existing function. It inserts no enabled cohorts. Activate only the explicitly reviewed cohort via `edu_ai_cohort_settings` after independent environment approval.
- Default caps: 500 requests per cohort per KST day, 30 per student per KST day; one pending student request, two pending mentor requests per actor. Failed requests count toward caps. Each request makes at most one provider call, with no automatic retry.
- Student conversations and mentor drafts are transient client state. Only a student-confirmed mentor question or operator-reviewed answer uses existing question persistence. Nothing is automatically published or messaged.
- Usage stores UUID scope, a fingerprint, model, counts, rate snapshot and completion state, never raw prompts, source text, provider responses or keys. Counts are read from provider usage, not estimated from text length. Missing usage/pricing is shown separately. Ledger references become null on account/resource deletion.

## Isolated DEV verification

Use the exact reviewed commit and a branch-scoped Preview. Verify its DB, Auth, payment and notification targets before deployment. Do not copy Production environment variables. Back up relevant catalog definitions/ACLs and the target cohort setting before applying only the named migration. Check existing prerequisites (`edu_assert_question_access`, `edu_message_operator`, cohort visibility, lesson block heads/versions and progression helpers).

Verify disabled and unauthorized requests make no provider calls; then enable only the approved DEV cohort, and use bounded synthetic questions. Compare a source excerpt against its current published lesson, follow-up history, mentor handoff, individual/bulk drafts and per-cohort usage. Verify permission/publication changes during generation block return. Existing lesson contents, answers, orders, payments and notifications must not be changed by a read/generation check. Draft publication is a separate deliberate action.

The frontend can show a preparation message for an inactive cohort; mentor questions remain available. Full RAG answer quality and latency require actual authorized DEV calls after local/CI tests. Mock tests do not establish those results.

## Rollback

First turn off the two deployment flags and restore the previous deployment. Restore the backed-up setting for the pilot cohort; do not delete usage, questions, evidence or answer rows. Since the migration is additive and inactive by default, leave its private tables/RPCs in place while reviewing rollback. Removal is a separate approved operation only after proving there are no new records/dependencies; it is not an automatic `DROP ... CASCADE`. Restoring code does not restore or erase DB data. The branch credential can remain a Secret while the feature is off, or be removed using the credential setup journal if explicitly requested.

## Checks

- `node --test tests/curriculum-ai*.test.mjs`
- `npx playwright test tests/browser/curriculum-ai.spec.ts`
- Existing learning-question, question-hub, question-thread and question-ai-batch regressions.
- Repository lint, typecheck, unit suite, build and all required remote browser shards/final verdict.

Cost rates for `gpt-5-mini` were checked against https://developers.openai.com/api/docs/models/gpt-5-mini on 2026-10-30. Other configured models remain explicitly unpriced until their rate mapping is reviewed. Estimated USD is not an invoice.
