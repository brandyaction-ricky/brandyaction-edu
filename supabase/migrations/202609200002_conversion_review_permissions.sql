begin;

-- Supabase default privileges can grant service_role direct table writes.
-- Remove those inherited grants: all mutations must use the validated,
-- SECURITY DEFINER edu_conversion_mutate RPC. Keep receipt access inside it.
revoke all on table
  public.edu_conversion_cases,
  public.edu_conversion_evidence,
  public.edu_conversion_runs,
  public.edu_conversion_reviews,
  public.edu_conversion_receipts
from public, anon, authenticated, service_role;

grant select on table
  public.edu_conversion_cases,
  public.edu_conversion_evidence,
  public.edu_conversion_runs,
  public.edu_conversion_reviews
to service_role;

commit;
