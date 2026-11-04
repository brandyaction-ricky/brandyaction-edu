import {createAdminClient} from '@/lib/supabase/admin';
import {getOperatorUser} from '@/lib/operator-permissions';
import {readSpaceJson} from '@/features/campus/space/body';
import {slugPattern,uuid,fail} from '@/features/campus/webinar/domain';
import {libraryFileInput,libraryDownloadPath} from '@/features/campus/webinar/resource-files';
import {readWebinar,privateReply,problem} from '@/features/campus/webinar/server';
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
  if(!await getOperatorUser('marketing'))fail('자료실 관리 권한이 필요합니다.',403);
  const b=await readSpaceJson(request,2000);
  if(typeof b.slug!=='string'||!slugPattern.test(b.slug)||!uuid(b.id))fail('행사와 자료를 선택해 주세요.');
  if(!await readWebinar(b.slug))fail('행사를 먼저 저장한 뒤 파일을 올려 주세요.',409);
  let file;try{file=libraryFileInput(b.name,b.size);}catch(e){fail((e as Error).message);}
  const path=`edu/campus-library/${b.slug}/${b.id}/${crypto.randomUUID()}.${file.extension}`;
  const {data,error}=await createAdminClient().storage.from('course-resources').createSignedUploadUrl(path,{upsert:false});
  if(error||!data)throw error||Error('upload');
  return privateReply({bucket:'course-resources',path,token:data.token,contentType:file.contentType,fileName:file.name,url:libraryDownloadPath(b.slug,b.id)});
 }catch(e){return problem(e);}
}
