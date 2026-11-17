import {timingSafeEqual} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin';
export const maxDuration=30;
export async function HEAD(){return new Response(null,{status:405,headers:{Allow:'GET'}});}
export async function GET(request:Request){const key=process.env.CRON_SECRET,supplied=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+(key||''));if(!key||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return new Response(null,{status:401});try{const r=await createAdminClient().rpc('edu_campus_activity_retention').abortSignal(AbortSignal.timeout(15000));if(r.error)throw r.error;return Response.json({removed:r.data},{headers:{'Cache-Control':'no-store'}});}catch{return new Response(null,{status:503});}}
