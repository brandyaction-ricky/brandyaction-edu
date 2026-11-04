import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {handleCases} from '@/features/campus/business/case-handler';
import {loadCases,mutateCase} from '@/features/campus/business/cases';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleCases(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:getAuthenticatedUser,read:async(a,e,c)=>loadCases(await createClient(),a,e,c),write:async(a,b)=>mutateCase(createAdminClient(),a,b)});
export const GET=handle;export const POST=handle;
