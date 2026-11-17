# Campus DEV-only migration package

Prepared target: `vjmjhaidlqkmascdjocw`. No production changes are permitted by this package. These files are a reviewed candidate, not evidence of application.

## Apply contract

1. Verify the selected Supabase project is the DEV project above. SQL cannot distinguish two projects merely from the common `postgres` database name. Do not use a linked-project default without checking its project identifier.
2. Freeze the source candidate and regenerate `manifest.json` / `sha256sums.txt` immediately before apply. Verify every listed file hash. Check the manifest still contains exactly the eleven campus migrations and no historical AI migrations. Take the read-only schema backup using `01-shared-facility-backup.sql` and preserve it privately.
3. Under one operator/deployment lock, run `00-collision-and-dependency-guard.sql`. Stop if any new object already exists, if the private portfolio bucket/policies collide, or if an existing dependency is missing. Do not repair migration history or replay old AI migrations to work around an exception.
4. Apply only `manifest.json.migrations` in numeric order. Each original file owns its transaction. Stop at the first failure; do not continue blindly or rerun successfully committed files. Record the exact successful versions/hashes separately; this package does not write `supabase_migrations` metadata.
5. Execute `02-postapply-metadata.sql`. Compare table RLS and function privileges with the reviewed SQL, including anon denial and service/authenticated boundaries. Then run authenticated DEV owner/non-owner/refunded-user read/write and paid-call-free route smoke tests before enabling employee QA features.
6. Keep bot connectors, shared room service configuration and paid AI calls disabled until their separate integration checks are complete. New campus schema does not authorize enabling every feature.

## Existing AI and question schema

Actual DEV metadata confirms the existing AI requests/calls/conversation tables, `edu_ai_student_*`, history access, curriculum RPCs and question RPCs, including `edu_delete_question_answer(uuid,uuid,uuid,uuid)`. This proves signatures and reported grants, not equality of function bodies. The ten `ca31870` historical SQL imports are preserved under `tests/fixtures/ai-reference-migrations/`, outside the executable migration directory. The lesson-block and student-history SQL there are clean-fixture references, not additional migrations to replay on DEV.

The imported runtime is deliberately reusing an existing populated service. A brand-new empty database needs the full historical dependency chain from its canonical repository; this package is not such an installer.

## Mutation and rollback boundaries

The eleven migrations add new campus tables/functions/policies and replace only functions first introduced within this same package. The archive migration reads existing owner data via narrow service-role functions; it does not weaken course/enrollment policies. Community file storage creates one private bucket and restrictive policies specific to that bucket. Space creates policies on existing `realtime.messages`. The package also grants limited access on existing source tables/schema usage; preserve the backup ACL and policy metadata before applying.

Before real QA data exists, a rollback still requires review of successfully committed objects and their dependencies. After any new records, files, consent history, cases or support events exist, do not drop tables, remove the bucket, truncate records or cascade-drop the `private` schema. Disable the affected runtime flags, preserve evidence, and prepare a separately reviewed corrective migration. Do not revert historical AI definitions. Reverting a UI build alone does not remove newly stored data.

The backup and postcheck queries contain schema metadata only. They do not select student content, secret configuration values or function bodies.

## Private operator evidence

Target-specific results and reviewed fingerprints are kept privately, outside the public repository. `03-seed-metadata-baseline.json` and `04-trigger-risk.private.md` are ignored local operator records; the public `04-trigger-risk.md` describes the verification procedure only. The runtime and local tests do not read those private files. Missing private evidence is a stop condition for remote QA, not permission to generate or accept a new baseline automatically.
