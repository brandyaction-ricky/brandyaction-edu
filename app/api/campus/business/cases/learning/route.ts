import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {handleLearningCases,loadLearningCases} from '@/features/campus/business/learning-cases';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleLearningCases(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true',authenticate:getAuthenticatedUser,read:(actor,enrollment,industry,cursor)=>loadLearningCases(createAdminClient(),actor,enrollment,industry,cursor)});
