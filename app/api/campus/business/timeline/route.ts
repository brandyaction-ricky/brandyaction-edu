import {createClient} from '@/lib/supabase/server';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {handleBusinessTimeline} from '@/features/campus/business/timeline-handler';
import {loadBusinessTimeline} from '@/features/campus/business/timeline-repository';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleBusinessTimeline(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:getAuthenticatedUser,read:async(actor,enrollmentId)=>loadBusinessTimeline(await createClient(),actor,enrollmentId)});}
