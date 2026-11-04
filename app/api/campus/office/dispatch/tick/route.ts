import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchBearerAllowed, readOutboundConnectors, runOfficeDispatch } from '@/features/campus/office/dispatch';
import { claimOfficeDispatch, finishOfficeDispatch } from '@/features/campus/office/dispatch-repository';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;
/** Explicit operator invocation only. No schedule is installed by this feature. */
export async function POST(request:Request){
 const connectors=readOutboundConnectors(process.env);
 if(!connectors.length||!dispatchBearerAllowed(request.headers.get('authorization'),process.env.EDU_CAMPUS_OFFICE_DISPATCH_TOKEN))return Response.json({error:'Unavailable'},{status:404});
 try{const db=createAdminClient();return Response.json(await runOfficeDispatch({connectors,claim:(c,id)=>claimOfficeDispatch(db,c,id),finish:(lease,outcome)=>finishOfficeDispatch(db,lease,outcome)}),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Dispatch verification required; no automatic replay.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
