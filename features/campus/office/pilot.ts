import {createClient} from '@/lib/supabase/server';
import {uuid} from '@/features/campus/webinar/domain';

export async function hasOfficePilot(enrollment: unknown) {
  if (process.env.EDU_CAMPUS_ENABLED !== 'true' || !uuid(enrollment)) return false;
  const db = await createClient();
  const {data,error} = await db.rpc('edu_campus_my_reporting_pilot',{p_enrollment:enrollment});
  return !error && data === true;
}
