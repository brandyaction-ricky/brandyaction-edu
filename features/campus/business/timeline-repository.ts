import type {createClient} from '@/lib/supabase/server';
import {assertBusinessScope} from './repository';
import {fail} from './domain';
import {buildBusinessTimeline,timelineStart,type TimelineInputs} from './timeline';
type Database=Awaited<ReturnType<typeof createClient>>;
type Result={data:unknown;error:unknown;count?:number|null};
async function pages(query:(from:number,to:number)=>PromiseLike<Result>){const rows:Record<string,unknown>[]=[];for(let from=0;from<20000;from+=500){const r=await query(from,from+499);if(r.error||!Array.isArray(r.data)||Number(r.count)>20000)fail(503);rows.push(...r.data);if(r.data.length<500)return rows;}fail(503);}
export async function loadBusinessTimeline(db:Database,actor:string,enrollmentId:string,now=Date.now()){
 await assertBusinessScope(db,actor,enrollmentId,now);const since=new Date(timelineStart(now)).toISOString();
 const [progress,submissions,focus,records]=await Promise.all([
 pages((a,b)=>db.from('lesson_progress').select('id,enrollment_id,completed_at',{count:'exact'}).eq('enrollment_id',enrollmentId).gte('completed_at',since).order('id').range(a,b)),
 pages((a,b)=>db.from('mission_submissions').select('id,enrollment_id,status,submitted_at,reviewed_at',{count:'exact'}).eq('enrollment_id',enrollmentId).or(`submitted_at.gte.${since},reviewed_at.gte.${since}`).order('id').range(a,b)),
 pages((a,b)=>db.from('edu_campus_focus_sessions').select('id,enrollment_id,status,updated_at,elapsed_seconds',{count:'exact'}).eq('enrollment_id',enrollmentId).eq('user_id',actor).eq('status','finished').gte('updated_at',since).order('id').range(a,b)),
 pages((a,b)=>db.from('edu_campus_business_records').select('id,enrollment_id,created_at',{count:'exact'}).eq('user_id',actor).eq('enrollment_id',enrollmentId).gte('created_at',since).order('id').range(a,b))]);
 return buildBusinessTimeline({enrollmentId,now,progress,submissions,focus,records} as unknown as TimelineInputs);
}
