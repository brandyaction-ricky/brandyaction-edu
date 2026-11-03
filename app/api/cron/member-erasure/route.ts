import {timingSafeEqual} from 'node:crypto';
import {dispatchMemberErasure} from '@/lib/member-erasure';
export const maxDuration=60;
// Next.js otherwise maps HEAD to GET, which must not trigger a deletion worker.
export async function HEAD(){return new Response(null,{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});}
export async function GET(request:Request) {
  const supplied=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from(`Bearer ${process.env.CRON_SECRET??''}`);
  if(!process.env.CRON_SECRET || supplied.length!==expected.length || !timingSafeEqual(supplied,expected))return Response.json({error:'Unauthorized'},{status:401});
  try{return Response.json(await dispatchMemberErasure(),{headers:{'Cache-Control':'no-store'}});}
  catch{return Response.json({error:'탈퇴 삭제 처리 상태를 확인해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
