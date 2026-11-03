import {getOperatorUser} from '@/lib/operator-permissions';
import {createAdminClient} from '@/lib/supabase/admin';
import {handleSpaceAdmin,loadSpaceControls,saveSpaceControls} from '@/features/campus/space/admin';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleSpaceAdmin(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_SPACE_ENABLED==='true',authenticate:()=>getOperatorUser('members'),read:c=>loadSpaceControls(createAdminClient(),c),write:(a,b)=>saveSpaceControls(createAdminClient(),a,b)});
export const GET=handle;export const POST=handle;
