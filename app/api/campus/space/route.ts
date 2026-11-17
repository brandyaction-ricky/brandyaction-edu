import {after} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {observeSpaceOperation} from '@/features/campus/space/http-metrics';
import {ID} from '@/features/campus/space/domain';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { handleSpace } from '@/features/campus/space/handler';
import { loadSpace, saveSpace } from '@/features/campus/space/server';
export const dynamic='force-dynamic';
function observe<T>(actor:string,cohort:string,run:()=>Promise<T>){return observeSpaceOperation(run,(status,elapsed)=>{if(!ID.test(cohort||''))return;after(async()=>{try{const r=await createAdminClient().rpc('edu_campus_observe_space_http',{p_actor:actor,p_cohort:cohort,p_status:status,p_elapsed:elapsed}).abortSignal(AbortSignal.timeout(2000));if(r.error)console.warn('campus_space_observation_unavailable');}catch{console.warn('campus_space_observation_unavailable');}});});}
function handle(request:Request){return handleSpace(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_SPACE_ENABLED==='true',authenticate:getAuthenticatedUser,load:async(viewer,cohort)=>observe(viewer.id,cohort,async()=>loadSpace(await createClient(),viewer,cohort)),save:async(viewer,command)=>observe(viewer.id,command.cohortId,async()=>saveSpace(await createClient(),viewer,command))});}
export const GET=handle;
export const POST=handle;
