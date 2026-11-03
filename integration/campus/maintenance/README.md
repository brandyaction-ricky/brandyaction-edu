# Space retention maintenance

Deploying the application does not schedule database maintenance. Before enabling a long-running live room, an operator must enable `pg_cron` in the selected environment, review the installed `public.edu_campus_space_prune()` function and apply `enable.sql` in that same session. This script is deliberately outside automatic migrations and does not configure production from a DEV deployment.

The hourly job removes only space chat older than seven days and presence/seat leases that expired more than one day ago. It does not delete coursework, portfolio files, focus journals, support requests, AI conversations or usage evidence. Each run has a three-second lock timeout and a twenty-second statement timeout. Other jobs and their history are untouched.

Set `campus.maintenance.reviewed` to `space-retention-v1` only after confirming the project and retention scope. `enable.sql` refuses a job-name collision instead of replacing another command. The operator must then inspect `cron.job` and the first matching `cron.job_run_details` result. Scheduling success alone is not run success. The rollback is `disable.sql`; it removes only the matching named job and preserves its run history and the extension.

DEV verification evidence and current job ID belong in the private deployment record. Neither a source comment nor this document claims that a job is installed on every environment.

References: [Supabase Cron quickstart](https://supabase.com/docs/guides/cron/quickstart), [managed extension permissions](https://supabase.com/kb/troubleshooting/revoking-privileges-on-storage-pg_cron-vault-and-extension-objects-has-no-effect).
