import {createAdminClient} from '@/lib/supabase/admin';
import {getAdminUser} from '@/lib/server-auth';
import {handleCases} from '@/features/campus/business/case-handler';
import {loadAdminCases,mutateCase} from '@/features/campus/business/cases';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleCases(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:getAdminUser,read:async(_a,c,cursor)=>loadAdminCases(createAdminClient(),c,cursor),write:async(a,b)=>mutateCase(createAdminClient(),a,b,true)},true);
export const GET=handle;export const POST=handle;
