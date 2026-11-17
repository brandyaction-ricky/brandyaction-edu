import {getOperatorUser} from '@/lib/operator-permissions';
import {createAdminClient} from '@/lib/supabase/admin';
import {handleSupport} from '@/features/campus/support/handler';
import {loadSupportAdmin,saveSupportAdmin} from '@/features/campus/support/repository';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleSupport(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_SUPPORT_ENABLED==='true',authenticate:()=>getOperatorUser('members'),read:async(_a,c)=>loadSupportAdmin(createAdminClient(),c),write:async(a,c)=>saveSupportAdmin(createAdminClient(),a.id,c)});
export const GET=handle;export const POST=handle;
