import { getAuthenticatedUser } from '@/lib/server-auth';
import { createClient } from '@/lib/supabase/server';
import { loadCampusSnapshot } from '@/features/campus/repository';
import { isCampusId } from '@/features/campus/snapshot';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
 if(process.env.EDU_CAMPUS_ENABLED!=='true'||process.env.EDU_CAMPUS_COMMUNITY_ENABLED!=='true')return reply({error:'준비 중입니다.'},404);
 const actor=await getAuthenticatedUser();if(!actor)return reply({error:'로그인이 필요합니다.'},401);const enrollmentId=new URL(req.url).searchParams.get('enrollmentId');if(!isCampusId(enrollmentId??''))return reply({error:'기수를 선택해 주세요.'},400);
 try{const db=await createClient(),snapshot=await loadCampusSnapshot(db,actor,enrollmentId!);const scope=snapshot.scopes.find(s=>s.enrollmentId===enrollmentId);if(!scope)return reply({error:'이용 권한이 없습니다.'},403);
 const r=await db.from('edu_campus_demo_slots').select('id,post_id,status,starts_at,minutes').eq('cohort_id',scope.cohortId).eq('status','presenting').limit(1).maybeSingle();if(r.error)throw r.error;if(!r.data)return reply({session:null});
 const p=await db.from('edu_campus_posts').select('id,title').eq('id',r.data.post_id).eq('visibility','cohort').eq('hidden',false).maybeSingle();if(p.error)throw p.error;if(!p.data)return reply({session:null});return reply({session:{sessionId:r.data.id,postId:p.data.id,status:r.data.status,title:p.data.title,startsAt:r.data.starts_at,minutes:r.data.minutes}});
 }catch{return reply({error:'발표 진행을 확인하지 못했습니다.'},503);}
}
