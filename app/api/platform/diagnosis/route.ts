import {getAuthenticatedUser} from '@/lib/server-auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {uuid} from '@/lib/edu-workflows';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie','X-Robots-Tag':'noindex, nofollow'}});
function failure(error:unknown) {
 const message=(error as {message?:string})?.message;
 const errors:Record<string,[string,number]>={
  DIAGNOSIS_DISABLED:['검사 기능을 준비하고 있습니다.',503],
  DIAGNOSIS_UNAVAILABLE:['이 상품에는 아직 검사가 연결되지 않았습니다.',404],
  DIAGNOSIS_FORBIDDEN:['검사를 이용할 수 있는 구매·수강 정보를 확인해 주세요.',403],
 };
 const [text,status]=errors[message??'']??['검사 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',503];
 return reply({error:text},status);
}
async function readSmallJson(request:Request) {
 const reader=request.body?.getReader();if(!reader)return null;
 const chunks:Uint8Array[]=[];let size=0;
 try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return null;}chunks.push(value);}}
 finally {reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return null;}
}
export async function GET() {
 if(process.env.EDU_MYIN_DIAGNOSIS_ENABLED!=='true')return reply({error:'검사 기능을 준비하고 있습니다.'},404);
 try {
  const user=await getAuthenticatedUser();if(!user)return reply({error:'로그인이 필요합니다.'},401);
  const {data,error}=await createAdminClient().rpc('edu_diagnosis_read',{p_actor:user.id});if(error)throw error;
  return reply(data);
 } catch(error){return failure(error);}
}
export async function POST(request:Request) {
 if(process.env.EDU_MYIN_DIAGNOSIS_ENABLED!=='true')return reply({error:'검사 기능을 준비하고 있습니다.'},404);
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'요청 출처를 확인해 주세요.'},403);
  const user=await getAuthenticatedUser();if(!user)return reply({error:'로그인이 필요합니다.'},401);
  const body=await readSmallJson(request);
  if(!body||Array.isArray(body)||Object.keys(body).some(key=>key!=='courseId')||!uuid(body.courseId))return reply({error:'검사를 시작할 상품을 확인해 주세요.'},400);
  const {data,error}=await createAdminClient().rpc('edu_diagnosis_begin',{p_actor:user.id,p_course:body.courseId});if(error)throw error;
  return reply(data,202);
 } catch(error){return failure(error);}
}
