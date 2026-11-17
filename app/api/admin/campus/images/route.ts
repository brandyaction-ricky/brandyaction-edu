import sharp from 'sharp';
import {getOperatorUser} from '@/lib/operator-permissions';
import {createAdminClient} from '@/lib/supabase/admin';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {fail} from '@/features/campus/webinar/domain';
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const user=await getOperatorUser('marketing');if(!user)fail('캠퍼스 관리 권한이 필요합니다.',403);
 if(Number(request.headers.get('content-length')||0)>3300000)fail('이미지는 3MB 이하로 올려 주세요.');
 const reader=request.body?.getReader();if(!reader)fail('이미지 파일을 확인해 주세요.');const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3300000){await reader.cancel();fail('이미지는 3MB 이하로 올려 주세요.');}chunks.push(value);}}finally{reader.releaseLock();}
 const raw=Buffer.concat(chunks),form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:raw}).formData(),file=form.get('image');if(!(file instanceof File)||file.size<1||file.size>3*1024*1024)fail('3MB 이하 이미지를 선택해 주세요.');
 // Decode and re-encode; never publish arbitrary user bytes or active SVG/HTML.
 let bytes:Buffer;try{bytes=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:25000000}).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer();}catch{fail('PNG·JPG·WEBP 이미지 파일을 확인해 주세요.');}
 const storage=createAdminClient().storage.from('course-assets'),path=`edu/campus/${user.id}/${crypto.randomUUID()}.webp`;
 const r=await storage.upload(path,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(r.error)throw r.error;
 return privateReply({url:storage.getPublicUrl(path).data.publicUrl});
}catch(e){return problem(e);}}
