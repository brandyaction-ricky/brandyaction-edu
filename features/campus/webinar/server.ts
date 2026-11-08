import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { WEBINAR_PREFIX, WEBINAR_TAG, slugPattern, validateWebinar, projectWebinar } from './domain';
export async function readWebinar(slug:string) {
 if(!slugPattern.test(slug))return null;
 const r=await createAdminClient().from('site_settings').select('value').eq('key',WEBINAR_PREFIX+slug).eq('is_public',false).is('value->>deletedAt',null).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
 if(r.error)throw r.error;
 return r.data?validateWebinar(r.data.value):null;
}
// No cookies, identities, enrollments or curriculum enter the shared cache.
export const publicWebinar=unstable_cache(async(slug:string)=>{const w=await readWebinar(slug);return w?.status==='published'?projectWebinar(w):null;},['edu-campus-webinar-public-v1'],{tags:[WEBINAR_TAG],revalidate:30});
export const privateReply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
export function problem(error:unknown){const e=error as {status?:number;message?:string};return privateReply({error:e.status?e.message:'일시적으로 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'},e.status||503);}
