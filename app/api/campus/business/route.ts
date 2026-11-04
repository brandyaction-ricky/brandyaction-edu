import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { handleBusiness } from '@/features/campus/business/handler';
import { loadBusiness,saveBusiness } from '@/features/campus/business/repository';
export const dynamic='force-dynamic';
function handle(request:Request){return handleBusiness(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:getAuthenticatedUser,load:async(v,e,c)=>loadBusiness(await createClient(),v.id,e,c),save:async(v,c)=>saveBusiness(await createClient(),v.id,c)});}
export const GET=handle;
export const POST=handle;
