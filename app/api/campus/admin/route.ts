import { getOperatorUser } from '@/lib/operator-permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { handleCampusAdminGet } from '@/features/campus/admin-handler';
import { loadCampusAdminSnapshot, loadCampusAdminOptions } from '@/features/campus/admin-repository';

export async function GET(request: Request) {
  return handleCampusAdminGet(request, {
    enabled: process.env.EDU_CAMPUS_ENABLED === 'true',
    authorize: () => getOperatorUser('members'),
    load: cohortId => cohortId ? loadCampusAdminSnapshot(createAdminClient(), cohortId) : loadCampusAdminOptions(createAdminClient()),
  });
}
