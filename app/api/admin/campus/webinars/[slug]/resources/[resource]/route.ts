import {createAdminClient} from '@/lib/supabase/admin';
import {getOperatorUser} from '@/lib/operator-permissions';
import {readWebinar,privateReply,problem} from '@/features/campus/webinar/server';
import {slugPattern} from '@/features/campus/webinar/domain';
import {libraryPathValid,LIBRARY_MAX_BYTES} from '@/features/campus/webinar/resource-files';

/** Staff can verify an uploaded draft without publishing the event or resource. */
export async function GET(_request:Request,{params}:{params:Promise<{slug:string;resource:string}>}){
 try{
  if(!await getOperatorUser('marketing'))return privateReply({error:'관리자 권한이 필요합니다.'},403);
  const {slug,resource}=await params;
  if(!slugPattern.test(slug)||!/^[-\w]{1,60}$/.test(resource))return privateReply({error:'자료를 찾을 수 없어요.'},404);
  const event=await readWebinar(slug),item=event?.resources?.find(r=>r.id===resource&&r.kind==='file');
  if(!item?.storagePath||!libraryPathValid(item.storagePath,slug,resource))return privateReply({error:'자료를 찾을 수 없어요.'},404);
  const storage=createAdminClient().storage.from('course-resources');
  const info=await storage.info(item.storagePath),size=info.data?.size;
  if(info.error||typeof size!=='number'||!Number.isFinite(size)||size<1||size>LIBRARY_MAX_BYTES)return privateReply({error:'파일을 준비하지 못했어요.'},404);
  const {data,error}=await storage.createSignedUrl(item.storagePath,60,{download:item.fileName||true});
  if(error||!data)throw error||Error('download');
  return new Response(null,{status:303,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',Vary:'Cookie'}});
 }catch(e){return problem(e);}
}
export function HEAD(){return new Response(null,{status:405,headers:{Allow:'GET','Cache-Control':'private, no-store'}});}
