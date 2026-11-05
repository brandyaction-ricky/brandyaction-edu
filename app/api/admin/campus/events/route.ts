import {randomBytes,createHash} from 'node:crypto';
import {getOperatorUser} from '@/lib/operator-permissions';
import {createAdminClient} from '@/lib/supabase/admin';
import {readSpaceJson} from '@/features/campus/space/body';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {fail,uuid} from '@/features/campus/webinar/domain';
import {eventSettings,eventPath,eventFilePath} from '@/features/campus/event/model';
import {getEvent,eventError} from '@/features/campus/event/server';
import {libraryFileInput,LIBRARY_MAX_BYTES} from '@/features/campus/webinar/resource-files';
export async function GET(request:Request){try{
 if(!await getOperatorUser('marketing'))fail('관리자 권한이 필요합니다.',403);
 const db=createAdminClient(),slug=new URL(request.url).searchParams.get('slug');
 const [z,c,h]=await Promise.all([db.from('edu_event_zones').select('*').order('created_at',{ascending:false}).limit(100),db.from('coupons').select('id,code,ends_at,discount_value,discount_type,is_active,is_draft').or('code.eq.1108,code.like.WIN_%'),db.from('cohorts').select('id,name,courses(title)').neq('status','archived').limit(200)]);
 if(z.error||c.error||h.error)throw z.error||c.error||h.error;
 let invites:unknown[]=[],counts:Record<string,number>={};
 if(slug){const zone=z.data.find(z=>z.slug===slug);if(zone){const [i,stats]=await Promise.all([db.from('edu_event_invites').select('id,label,user_id,claimed_at,revoked_at,created_at').eq('zone_id',zone.id).order('created_at',{ascending:false}).limit(1000),db.rpc('edu_event_stats',{p_zone:zone.id})]);if(i.error||stats.error)throw i.error||stats.error;invites=i.data;counts=stats.data;}}
 return privateReply({zones:z.data.map(z=>({...z,couponEndsAt:c.data.find(c=>c.id===z.bonus_coupon_id)?.ends_at})),cohorts:h.data,liveCoupon:c.data.find(c=>c.code==='1108')||null,invites,counts});
}catch(e){return problem(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const actor=await getOperatorUser('marketing');if(!actor)fail('관리자 권한이 필요합니다.',403);
 const b=await readSpaceJson(request,30000),db=createAdminClient();
 if(b.action==='save'){
  const settings=eventSettings(b.settings);if(b.expected!==null&&!uuid(b.expected))fail('저장 버전을 확인해 주세요.');
  for(const r of settings.resources){if(!r.published)continue;const info=await db.storage.from('campus-event-assets').info(r.storagePath);if(info.error||!info.data||typeof info.data.size!=='number'||info.data.size<1||info.data.size>LIBRARY_MAX_BYTES)fail('파일 업로드를 완료한 뒤 저장해 주세요.');}
  const r=await db.rpc('edu_event_save',{p_actor:actor.id,p_values:settings,p_expected:b.expected});if(r.error)eventError(r.error);return privateReply({ok:true});
 }
 if(typeof b.slug!=='string')fail('이벤트를 선택해 주세요.');const zone=await getEvent(b.slug);
 if(b.action==='invite'){
  const count=Number(b.count);if(!Number.isInteger(count)||count<1||count>100)fail('한 번에 1~100개의 초대 링크를 만들 수 있습니다.');
  const amount=await db.from('edu_event_invites').select('id',{count:'exact',head:true}).eq('zone_id',zone.id);if(amount.error)throw amount.error;if((amount.count||0)+count>1000)fail('이벤트당 초대 링크는 최대 1,000개입니다.');
  const rows=Array.from({length:count},(_,n)=>{const token=randomBytes(32).toString('hex');return{id:crypto.randomUUID(),token,label:`당첨자 ${(amount.count||0)+n+1}`};});
  const saved=await db.rpc('edu_event_invite_batch',{p_actor:actor.id,p_zone:zone.id,p_rows:rows.map(r=>({id:r.id,label:r.label,token_hash:createHash('sha256').update(r.token).digest('hex')}))});if(saved.error)throw saved.error;
  return privateReply({links:rows.map(r=>({id:r.id,label:r.label,path:eventPath(zone.slug)+'?invite='+r.token}))});
 }
 if(b.action==='revoke'){
  if(!uuid(b.id))fail('초대 링크를 선택해 주세요.');const r=await db.from('edu_event_invites').update({revoked_at:new Date().toISOString()}).eq('zone_id',zone.id).eq('id',b.id).is('claimed_at',null).select('id');if(r.error)throw r.error;if(!r.data.length)fail('이미 수령했거나 없는 초대 링크입니다.',409);return privateReply({ok:true});
 }
 if(b.action==='upload'){
  if(!uuid(b.id))fail('자료를 선택해 주세요.');const file=libraryFileInput(b.name,b.size),path=`edu/campus-event/${zone.slug}/${b.id}/${crypto.randomUUID()}.${file.extension}`;
  if(!eventFilePath(path,zone.slug,b.id))fail('파일 경로를 확인해 주세요.');const r=await db.storage.from('campus-event-assets').createSignedUploadUrl(path,{upsert:false});if(r.error||!r.data)throw r.error||Error('upload');return privateReply({path,token:r.data.token,contentType:file.contentType});
 }
 fail('요청을 확인해 주세요.');
}catch(e){return problem(e);}}
