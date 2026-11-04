import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {handleArchive} from '@/features/campus/business/archive-handler';
import {readArchive,writeArchive} from '@/features/campus/business/archive';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleArchive(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:getAuthenticatedUser,read:async(a,c,e,p)=>readArchive(createAdminClient(),a,c,e,p),write:async(a,b)=>writeArchive(createAdminClient(),a,b)});
export const GET=handle;export const POST=handle;
