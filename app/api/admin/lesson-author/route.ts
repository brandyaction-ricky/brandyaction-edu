import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { uuid } from '@/lib/edu-workflows';
import { validateAuthorPayload } from '@/lib/lesson-author-drafts';
import { revalidateTag } from 'next/cache';
import { PUBLIC_CACHE_TAG } from '@/lib/public-platform-plan';

const reply = (value: unknown,status=200) => Response.json(value,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
const known: Record<string,[string,number]> = {
  AUTHOR_FORBIDDEN:['상품 관리 권한이 필요합니다.',403], BLOCK_FORBIDDEN:['상품 관리 권한이 필요합니다.',403],
  AUTHOR_NOT_FOUND:['수업 또는 편집 이력을 찾을 수 없습니다.',404], BLOCK_NOT_FOUND:['삭제된 수업은 편집할 수 없습니다.',404],
  AUTHOR_CHANGED:['다른 화면에서 초안을 저장했습니다. 작성한 내용을 보관한 뒤 최신 초안을 다시 열어 주세요.',409],
  AUTHOR_PUBLIC_CHANGED:['학생 화면의 내용이나 공개 설정이 바뀌었습니다. 최신 공개본과 초안을 확인해 주세요.',409],
  AUTHOR_COURSE_FIXED:['같은 상품의 주차만 선택할 수 있습니다.',400], AUTHOR_BLOCKS_REQUIRED:['기존 질문·생성기 구성을 유지해 주세요.',400],
  AUTHOR_INVALID:['반영할 내용을 확인해 주세요.',400], BLOCK_INVALID:['학습 구성의 필수 항목을 확인해 주세요.',400],
  BLOCK_CONTENT_CHANGED:['공개본이 바뀌었습니다. 최신 내용을 확인해 주세요.',409],
  BLOCK_PROGRESSION_DUPLICATE:['같은 상품에 동일한 진행 일차가 있습니다.',409],
  BLOCK_MEDIA_INVALID:['업로드가 끝난 같은 상품의 파일인지 확인해 주세요.',400],
  ONGOING_INVALID:['지속 챌린지의 완료 방식과 진행 일차를 확인해 주세요.',400],
};
function failure(error: unknown) {
  const e = error as {message?:string;code?:string}; const k=known[e.message || ''];
  if(k) return reply({error:k[0]},k[1]);
  if(e.code==='23505') return reply({error:'이미 사용 중인 일차입니다. 다른 일차를 선택해 주세요.'},409);
  return reply({error:'저장 결과를 확인하지 못했습니다. 작성한 내용을 보관하고 다시 열어 주세요.'},503);
}
export async function GET(request:Request) {
  try {
    const actor=await getOperatorUser('products');if(!actor)return reply({error:'상품 관리 권한이 필요합니다.'},403);
    const q=new URL(request.url).searchParams,lesson=q.get('lesson'),version=q.get('version'),source=q.get('source');
    if(!uuid(lesson)||(version!==null&&!uuid(version))||(source!==null&&source!=='public')||(source&&version))return reply({error:'수업을 확인해 주세요.'},400);
    if(source==='public'){
      const {data,error}=await createAdminClient().rpc('edu_lesson_author_snapshot',{p_actor:actor.id,p_lesson:lesson}).abortSignal(AbortSignal.timeout(15_000));
      if(error)throw error;return reply({payload:data.payload,stamp:data.stamp});
    }
    const {data,error}=await createAdminClient().rpc('edu_read_lesson_author',{p_actor:actor.id,p_lesson:lesson,p_version:version}).abortSignal(AbortSignal.timeout(15_000));
    if(error)throw error;
    // Fetch one full lesson at a time; duplicating public + draft bodies can exceed
    // the hosting response limit even when each saved draft is within its limit.
    return reply(version ? data : {...data,public:{stamp:data.public.stamp,blockRevision:data.public.blockRevision}});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  try {
    if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'허용되지 않은 요청입니다.'},403);
    const actor=await getOperatorUser('products');if(!actor)return reply({error:'상품 관리 권한이 필요합니다.'},403);
    const reader=request.body?.getReader();if(!reader)return reply({error:'요청 내용을 확인해 주세요.'},400);
    const chunks:string[]=[],decoder=new TextDecoder();let size=0;
    try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4_100_000){await reader.cancel();return reply({error:'초안이 너무 큽니다.'},413);}chunks.push(decoder.decode(value,{stream:true}));}chunks.push(decoder.decode());}finally{reader.releaseLock();}
    let body;try{body=JSON.parse(chunks.join(''));}catch{return reply({error:'요청 형식을 확인해 주세요.'},400);}
    if(!body||!uuid(body.lessonId)||!uuid(body.requestId)||!['save','publish','backup'].includes(body.action))return reply({error:'저장할 수업을 확인해 주세요.'},400);
    const db=createAdminClient();
    if(body.action==='backup'){
      if(typeof body.stamp!=='string'||!/^[a-f0-9]{32}$/.test(body.stamp))return reply({error:'보관할 초안 버전을 확인해 주세요.'},400);
      let payload;try{payload=validateAuthorPayload(body.payload);}catch(error){return reply({error:(error as Error).message},400);}
      const {data,error}=await db.rpc('edu_backup_lesson_author',{p_actor:actor.id,p_lesson:body.lessonId,p_request:body.requestId,p_stamp:body.stamp,p_payload:payload}).abortSignal(AbortSignal.timeout(15_000));
      if(error)throw error;return reply(data);
    }
    if(body.action==='save'){
      if((body.expectedRevision!==null&&!uuid(body.expectedRevision))||(body.stamp!==null&&(typeof body.stamp!=='string'||!/^[a-f0-9]{32}$/.test(body.stamp)))||typeof body.create!=='boolean'||typeof body.rebase!=='boolean')return reply({error:'초안 버전을 확인해 주세요.'},400);
      let payload;try{payload=validateAuthorPayload(body.payload);}catch(error){return reply({error:(error as Error).message},400);}
      const {data,error}=await db.rpc('edu_save_lesson_author',{p_actor:actor.id,p_lesson:body.lessonId,p_expected:body.expectedRevision,p_request:body.requestId,p_stamp:body.stamp,p_payload:payload,p_create:body.create,p_rebase:body.rebase}).abortSignal(AbortSignal.timeout(15_000));
      if(error)throw error;return reply(data);
    }
    if(!uuid(body.revision))return reply({error:'저장한 초안을 확인해 주세요.'},400);
    // Validate the acknowledged server draft; caller-supplied content is ignored.
    const loaded=await db.rpc('edu_read_lesson_author',{p_actor:actor.id,p_lesson:body.lessonId,p_version:null}).abortSignal(AbortSignal.timeout(15_000));
    if(loaded.error)throw loaded.error;if(loaded.data?.revision!==body.revision)throw new Error('AUTHOR_CHANGED');
    try{validateAuthorPayload(loaded.data.payload,true);}catch(error){return reply({error:(error as Error).message},400);}
    const {data,error}=await db.rpc('edu_publish_lesson_author',{p_actor:actor.id,p_lesson:body.lessonId,p_revision:body.revision,p_request:body.requestId}).abortSignal(AbortSignal.timeout(15_000));
    if(error)throw error;revalidateTag(PUBLIC_CACHE_TAG,{expire:0});return reply(data);
  }catch(error){return failure(error);}
}
