import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOperatorUser } from '@/lib/operator-permissions';
import { readSpaceJson } from '@/features/campus/space/body';
import { ARCHIVED_WEBINAR_PREFIX, WEBINAR_PREFIX, WEBINAR_TAG, validateWebinar, slugPattern, uuid, fail, eventNames } from '@/features/campus/webinar/domain';
import { readWebinar, privateReply, problem } from '@/features/campus/webinar/server';
async function actor(){const u=await getOperatorUser('marketing');if(!u)fail('마케팅 운영 권한이 필요합니다.',403);return u;}
export async function GET(request:Request){
 try{
  await actor();const db=createAdminClient(),slug=new URL(request.url).searchParams.get('slug');
  if(slug){
   if(!slugPattern.test(slug))fail('행사 주소를 확인해 주세요.');
   const since=new Date(Date.now()-30*86400000).toISOString();
   const stats=await Promise.all(eventNames.map(async name=>{const r=await db.from('customer_journey_events').select('id',{count:'exact',head:true}).eq('event_name',name==='entry'?'page_view':'click').eq('metadata->>webinar_action',name).eq('path','/campus/live/'+slug).gte('occurred_at',since).abortSignal(AbortSignal.timeout(5000));if(r.error)throw r.error;return [name,r.count||0];}));
   const settings=await db.from('site_settings').select('value').eq('key','edu_operations').maybeSingle();if(settings.error)throw settings.error;
   return privateReply({counts:Object.fromEntries(stats),since,trackingEnabled:settings.data?.value?.trackingEnabled===true});
  }
  const [events,cohorts]=await Promise.all([
   db.from('site_settings').select('value',{count:'exact'}).like('key',WEBINAR_PREFIX.replaceAll('_','\\_')+'%').eq('is_public',false).order('updated_at',{ascending:false}).limit(100).abortSignal(AbortSignal.timeout(5000)),
   db.from('cohorts').select('id,name,course_id,courses(title,slug,status,archived_at)').is('archived_at',null).order('created_at',{ascending:false}).limit(200).abortSignal(AbortSignal.timeout(5000))
  ]);
  if(events.error||cohorts.error)throw events.error||cohorts.error;
  return privateReply({events:(events.data||[]).map(r=>validateWebinar(r.value)),moreEvents:(events.count||0)>100,cohorts:cohorts.data||[]});
 }catch(e){return problem(e);}
}
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
  const user=await actor(),body=await readSpaceJson(request,600000);
  if(Object.keys(body).some(k=>!['event','expectedRevision'].includes(k))||!(body.expectedRevision===null||uuid(body.expectedRevision)))fail('저장 요청을 확인해 주세요.');
  const w=validateWebinar(body.event),current=await readWebinar(w.slug),expected=body.expectedRevision;
  const success=()=>{revalidateTag(WEBINAR_TAG,{expire:0});return privateReply({event:w});};
  if(current?.revision===w.revision){if(JSON.stringify(current)===JSON.stringify(w))return success();fail('같은 저장 요청의 내용이 변경됐습니다. 다시 불러와 주세요.',409);}
  if((current?.revision||null)!==expected)fail('다른 운영자가 수정했습니다. 최신 설정을 다시 불러와 주세요.',409);
  const db=createAdminClient();
  if (expected === null) {
    const archived = await db.from('site_settings').select('key').eq('key', ARCHIVED_WEBINAR_PREFIX+w.slug).maybeSingle();
    if (archived.error) throw archived.error;
    if (archived.data) fail('삭제한 행사 주소입니다. 다른 주소를 입력해 주세요.', 409);
  }
  const cohort=await db.from('cohorts').select('id,course_id,archived_at,courses(slug,status,archived_at)').eq('id',w.cohortId).maybeSingle();
  if(cohort.error)throw cohort.error;if(!cohort.data||cohort.data.archived_at)fail('사용 가능한 기수를 선택해 주세요.');
  const raw=cohort.data.courses,course=(Array.isArray(raw)?raw[0]:raw) as {slug?:string;status?:string;archived_at?:string}|null;
  if(w.status==='published'&&(!course||course.status!=='published'||course.archived_at))fail('공개된 클래스의 기수만 연결할 수 있습니다.');
  if(!course?.slug||w.detailPath!=='/classes/'+course.slug)fail('선택한 기수의 상세 페이지와 주소가 다릅니다.');
  const row={value:w,is_public:false,updated_by:user.id,updated_at:new Date().toISOString()};
  const r=expected===null?await db.from('site_settings').insert({key:WEBINAR_PREFIX+w.slug,...row}).select('key').abortSignal(AbortSignal.timeout(5000)).maybeSingle():await db.from('site_settings').update(row).eq('key',WEBINAR_PREFIX+w.slug).eq('is_public',false).eq('value->>revision',expected).select('key').abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if(r.error&&r.error.code!=='23505')throw r.error;
  if(r.error?.code==='23505'&&expected===null)fail('이미 사용한 행사 주소입니다. 다른 주소를 입력해 주세요.',409);
  if(r.error||!r.data)fail('저장 내용이 충돌했습니다. 최신 설정을 다시 불러와 주세요.',409);
  return success();
 }catch(e){return problem(e);}
}

export async function DELETE(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) fail('요청 출처를 확인해 주세요.', 403);
    const user = await actor();
    const {slug, expectedRevision} = await readSpaceJson(request, 2048);
    if (typeof slug !== 'string' || !slugPattern.test(slug) || !uuid(expectedRevision)) fail('삭제할 행사를 확인해 주세요.');
    const current = await readWebinar(slug);
    if (current) {
      if (current.revision !== expectedRevision) fail('다른 운영자가 수정했습니다. 목록을 새로고침한 뒤 다시 확인해 주세요.', 409);
      const deletedAt = new Date().toISOString();
      const result = await createAdminClient().from('site_settings')
        .update({key: ARCHIVED_WEBINAR_PREFIX + slug, updated_at: deletedAt, updated_by: user.id})
        .eq('key', WEBINAR_PREFIX + slug).eq('is_public', false)
        .eq('value->>revision', expectedRevision)
        .select('key').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) fail('행사 상태가 변경됐습니다. 목록을 새로고침해 주세요.', 409);
    }
    revalidateTag(WEBINAR_TAG, {expire: 0});
    return privateReply({deleted: true});
  } catch (error) { return problem(error); }
}
