import {getAuthenticatedUser} from '@/lib/server-auth';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {handleSupport} from '@/features/campus/support/handler';
import {loadSupport,saveSupport} from '@/features/campus/support/repository';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleSupport(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_SUPPORT_ENABLED==='true',authenticate:getAuthenticatedUser,read:async(a,e)=>loadSupport(await createClient(),a.id,e,createAdminClient,new URL(request.url).searchParams.get('view')==='signals'),write:async(a,c)=>saveSupport(await createClient(),createAdminClient,a.id,c)});
export const GET=handle;export const POST=handle;
