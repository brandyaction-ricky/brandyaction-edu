import type {createAdminClient} from '@/lib/supabase/admin';
import {campusError} from '../snapshot';
import {ID,type SpaceControls} from './domain';
import {readSpaceJson} from './body';
type DB=ReturnType<typeof createAdminClient>;
const fail=(status=503):never=>campusError(status,'공간 운영 설정을 확인하지 못했습니다.');
export async function loadSpaceControls(db:DB,cohort:string):Promise<SpaceControls>{
 if(!ID.test(cohort))fail(400);const c=await db.from('cohorts').select('id').eq('id',cohort).maybeSingle();if(c.error)fail();if(!c.data)fail(404);
 const r=await db.from('edu_campus_space_controls').select('announcement,paused,closed_zones,revision,updated_at').eq('cohort_id',cohort).maybeSingle();if(r.error)fail();return r.data?{announcement:r.data.announcement,paused:r.data.paused,closedZones:r.data.closed_zones||[],revision:r.data.revision,updatedAt:r.data.updated_at}:{announcement:'',paused:false,revision:0,updatedAt:null};
}
export async function saveSpaceControls(db:DB,actor:string,b:Record<string,unknown>){
 const cohort=String(b.cohortId||'');if(b.closedZones!==undefined&&!Array.isArray(b.closedZones))fail(400);const closed=Array.isArray(b.closedZones)?b.closedZones:[];if(closed.length>6||closed.some(z=>typeof z!=='string'||!['desk','mission','board','chat','terrace','launch'].includes(z))||new Set(closed).size!==closed.length)fail(400);if(!ID.test(cohort)||typeof b.announcement!=='string'||b.announcement.length>500||typeof b.paused!=='boolean'||!Number.isSafeInteger(b.revision)||Number(b.revision)<0)fail(400);
 await loadSpaceControls(db,cohort);const row={cohort_id:cohort,announcement:String(b.announcement).trim(),paused:b.paused,closed_zones:closed,revision:Number(b.revision)+1,updated_by:actor,updated_at:new Date().toISOString()};
 const r=b.revision===0?await db.from('edu_campus_space_controls').insert(row).select('cohort_id'):await db.from('edu_campus_space_controls').update(row).eq('cohort_id',cohort).eq('revision',b.revision).select('cohort_id');
 if(r.error){if(r.error.code==='23505')fail(409);fail();}if(!r.data?.length)fail(409);return loadSpaceControls(db,cohort);
}
export async function handleSpaceAdmin(request:Request,deps:{enabled:boolean;authenticate:()=>Promise<{id:string}|null>;read:(cohort:string)=>Promise<SpaceControls>;write:(actor:string,b:Record<string,unknown>)=>Promise<SpaceControls>}){
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});if(!deps.enabled)return reply({error:'준비 중입니다.'},404);
 const url=new URL(request.url),origin=request.headers.get('origin');if(origin&&origin!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'||request.method==='POST'&&origin!==url.origin)return reply({error:'요청 출처를 확인해 주세요.'},403);
 if(!['GET','POST'].includes(request.method))return reply({error:'허용되지 않은 요청입니다.'},405);
 try{const actor=await deps.authenticate();if(!actor)return reply({error:'운영 권한을 확인해 주세요.'},403);return reply(request.method==='GET'?await deps.read(url.searchParams.get('cohortId')||''):await deps.write(actor.id,await readSpaceJson(request)));}
 catch(e){const status=e instanceof Error&&'status'in e&&[400,403,404,409].includes(Number(e.status))?Number(e.status):503;return reply({error:status===409?'다른 운영자가 변경했습니다. 새로고침 후 확인해 주세요.':'공간 운영 설정을 확인하지 못했습니다.'},status);}
}
