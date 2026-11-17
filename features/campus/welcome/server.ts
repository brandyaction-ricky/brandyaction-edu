import {visibleCampusContent} from '../content/model';
import {unstable_cache} from 'next/cache';
import type {TourRole} from '../tour/model';
import {createAdminClient} from '@/lib/supabase/admin';
import {WEBINAR_TAG,WEBINAR_PREFIX,validateWebinar,projectWebinar} from '../webinar/domain';
import {DEFAULT_WELCOME,visibleWelcome} from './content';
/** Call only after server-side enrollment or active operator authorization. */
export async function readWelcome(cohortId?:string,role:TourRole='student'){return cachedWelcome(cohortId,role);}
const cachedWelcome=unstable_cache(async(cohortId?:string,role:TourRole='student')=>{
 if(!cohortId)return{settings:visibleWelcome(DEFAULT_WELCOME),resources:[],content:{}};
 const rows=await createAdminClient().from('site_settings').select('value').like('key',WEBINAR_PREFIX.replaceAll('_','\\_')+'%').eq('is_public',false).eq('value->>cohortId',cohortId).order('updated_at',{ascending:false}).limit(100).abortSignal(AbortSignal.timeout(5000));
 if(rows.error)throw rows.error;
 const events=(rows.data||[]).map(row=>validateWebinar(row.value));
 // Event publicity controls guests; welcome content remains available to entitled members.
 const settings=visibleWelcome(events.find(e=>e.welcome)?.welcome||DEFAULT_WELCOME);
 const seen=new Set<string>();const resources=events.filter(e=>e.status==='published').flatMap(e=>projectWebinar(e).resources||[]).filter(r=>{if(seen.has(r.url))return false;seen.add(r.url);return true;});
 return{settings,resources,content:visibleCampusContent(events.find(e=>e.content)?.content,role)};
},['campus-welcome-content-v2'],{tags:[WEBINAR_TAG],revalidate:30});
