import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleFlow,loadFlowState,saveFlow } from '@/features/campus/community/workflow-server';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleFlow(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_COMMUNITY_ENABLED==='true',authenticate:getAuthenticatedUser,load:async id=>loadFlowState(await createClient(),id),save:async c=>saveFlow(await createClient(),c)});
export const GET=handle;export const POST=handle;
