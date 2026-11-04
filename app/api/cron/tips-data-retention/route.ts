import { createAdminClient } from '@/lib/supabase/admin';
import { scheduledDataRetention } from '@/lib/edu-tips-data-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export function GET(request: Request) {
 return scheduledDataRetention(request,{env:process.env,rpc:async(name,args,signal)=>{
  const {data,error}=await createAdminClient().rpc(name,args).abortSignal(signal);return {data,error};
 }});
}
export function HEAD() { return new Response(null,{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}}); }
