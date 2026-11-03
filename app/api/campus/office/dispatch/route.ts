import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { readOutboundConnectors } from '@/features/campus/office/dispatch';
import { handleOfficeDispatch } from '@/features/campus/office/dispatch-handler';
import { loadOfficeDispatch, saveOfficeDispatch } from '@/features/campus/office/dispatch-repository';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function handle(request:Request){const connectors=readOutboundConnectors(process.env);return handleOfficeDispatch(request,{enabled:process.env.EDU_CAMPUS_ENABLED==='true'&&process.env.EDU_CAMPUS_OFFICE_ENABLED==='true'&&process.env.EDU_CAMPUS_OFFICE_DISPATCH_ENABLED==='true',authenticate:getAuthenticatedUser,load:async(viewer,id)=>loadOfficeDispatch(await createClient(),viewer,id,connectors),save:async(viewer,c)=>saveOfficeDispatch(await createClient(),viewer,c,connectors)});}
export const GET=handle;export const POST=handle;
