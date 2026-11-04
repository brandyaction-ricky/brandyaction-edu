import {createAdminClient} from '@/lib/supabase/admin';
import {readWebinar,privateReply,problem} from '@/features/campus/webinar/server';
import {slugPattern} from '@/features/campus/webinar/domain';
import {libraryPathValid,LIBRARY_MAX_BYTES} from '@/features/campus/webinar/resource-files';
export async function GET(_request:Request,{params}:{params:Promise<{slug:string;resource:string}>}){
 try{
  const {slug,resource}=await params;
  if(!slugPattern.test(slug)||!/^[-\w]{1,60}$/.test(resource))return privateReply({error:'자료를 찾을 수 없어요.'},404);
  // Deliberately uncached: hiding a resource immediately prevents new download links.
  const event=await readWebinar(slug),item=event?.status==='published'?event.resources?.find(r=>r.id===resource&&r.kind==='file'&&r.published):null;
  if(!item?.storagePath||!libraryPathValid(item.storagePath,slug,resource))return privateReply({error:'공개된 자료가 아닙니다.'},404);
  const storage=createAdminClient().storage.from('course-resources');
  const info=await storage.info(item.storagePath);
  const size=info.data?.size;
  if(info.error||!info.data||typeof size!=='number'||!Number.isFinite(size)||size<1||size>LIBRARY_MAX_BYTES)return privateReply({error:'파일을 준비하지 못했어요.'},404);
  const {data,error}=await storage.createSignedUrl(item.storagePath,60,{download:item.fileName||true});
  if(error||!data)throw error||Error('download');
  return new Response(null,{status:303,headers:{Location:data.signedUrl,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 }catch(e){return problem(e);}
}
export function HEAD(){return new Response(null,{status:405,headers:{Allow:'GET','Cache-Control':'private, no-store'}});}
