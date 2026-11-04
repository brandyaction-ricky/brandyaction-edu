# Curriculum AI: technical setup and verification

The feature searches all eligible published lessons in the enrollment's course locally, then sends up to six relevant text excerpts to the Responses API. It does not fine-tune a model or upload a persistent curriculum file. Student access excludes locked lessons and unpublished cohort material. Draft lesson versions, learner submissions and quiz answer keys are excluded. Text retrieval does not read words embedded only in lesson images or downloads; a student's explicitly attached screenshot and the mentor's existing verified question-image loader are supported. Lesson images and downloads are not automatically read.

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

## Question entry and screenshots

- In-lesson questions bind the current enrollment/lesson automatically and display its day and title. The separate Q&A write screen requires an explicit accessible lesson/day selection before opening the same AI/mentor conversation; general, account and payment questions remain available without a lesson. Changing scope confirms discarding an unsaved conversation or attachment and is blocked while a request/upload is in flight.
- Gray examples are placeholders only; they are never submitted as question content.
- With the existing question-image flag enabled, students can drag an image file onto the AI or mentor question area, paste a screenshot, or pick a file (one image, up to 10MB). File drags highlight the drop area; text/URL drags retain normal browser behavior. Dropping only attaches the image and never submits a question. Uploading, pending answers and uncertain question submissions block replacement while preventing file-drop navigation. Invalid, oversized or multiple files preserve the existing text and attachment. The existing private prepare/upload/verify pipeline is reused. Upload failure retains the text and blocks an incomplete send. A preview can be removed before asking. Each screenshot accompanies only the current question. After a successful answer it is cleared from the composer and remains visible in saved history; later questions do not automatically resend it.
- The server accepts only an image UUID, verifies owner, enrollment, lesson, ready state, size, signature and immutable SHA-256, then re-encodes the first frame with metadata removed and a 2048px bound. Arbitrary client URLs/base64 are not provider image inputs. Current access is checked before and after generation. Provider storage is disabled and image bytes do not enter the usage ledger. Uploaded originals remain in the existing private question-image storage; closing a conversation does not delete an upload.
- Students are told that attached screenshots go to OpenAI and to redact personal information/passwords. Vision is a reading aid and may miss small or cropped text; missing curriculum evidence still requires mentor review. The same uploaded screenshot can accompany an explicitly reviewed private mentor handoff without uploading it again. No question or answer is automatically posted.
- No new SQL or environment variable is required for this UI/server addition. Existing upload quotas and permission checks remain in force. Actual screenshot answer quality needs separately authorized DEV provider calls; synthetic tests do not establish that quality.

References: [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), [Supabase private storage download](https://supabase.com/docs/reference/javascript/storage-from-download).

## Per-lesson student conversation history

- Migration `20261031022224_edu_ai_student_conversation_history.sql` adds two private RLS tables and five service-only invoker RPCs. It does not enable a cohort, modify existing functions, expose authenticated-role table access, or change usage-ledger content. No earlier in-memory conversations can be recovered or backfilled.
- Student requests reserve a private exchange before generating and atomically save the validated answer with request completion. Completed request UUIDs return the saved answer without another provider call. Pending/failed/reused request UUIDs cannot start duplicate generation. Only the most recent two successful exchanges (four truncated text turns) are supplied as server-owned context; client history is ignored.
- A lesson reopens its saved exchanges; My Questions has a separate private AI conversation list. Both use keyset pagination with 20 displayed records and one lookahead. Reading, pagination and reopening never call OpenAI. Authorization checks the current account, owned enrollment and accessible lesson. Other users/operators cannot read private AI exchanges through this API. Withdrawn/revoked lesson access is not bypassed by history reads.
- Original attachments remain in the private question-image bucket. History stores only their immutable IDs and reads them through an authenticated request-scoped endpoint. They are not automatically sent on the next question. The latest screenshot may be reviewed in a mentor handoff before explicit registration. Metadata-only usage tables continue to exclude question/answer text.
- Closing saved history is safe; unsent text/attachments still require confirmation. A lost response is recovered by refreshing the saved history or retrying the same immutable request. A failed save must not be presented as a successfully saved answer. Database removal or code rollback must preserve conversation data. The additive schema may remain unused when restoring the prior code; do not drop tables containing student history.
