import {createHash} from 'node:crypto';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {readSpaceJson} from '@/features/campus/space/body';
import {privateReply,problem} from '@/features/campus/webinar/server';
import {fail} from '@/features/campus/webinar/domain';
import {eventView,eventError,getEvent} from '@/features/campus/event/server';
import {eventFilePath,invitePattern,type EventResource} from '@/features/campus/event/model';
import {LIBRARY_MAX_BYTES} from '@/features/campus/webinar/resource-files';
export async function GET(request:Request){try{
 const user=await getAuthenticatedUser(),params=new URL(request.url).searchParams,slug=params.get('slug')||'';
 if(!params.has('file'))return privateReply(await eventView(slug,user?.id||null));
 if(!user)fail('로그인이 필요합니다.',401);
 const z=await getEvent(slug);if(!z.enabled)fail('이벤트가 닫혀 있습니다.',404);
 const db=createAdminClient(),a=await db.from('edu_event_awards').select('wallet_id').eq('zone_id',z.id).eq('user_id',user.id).maybeSingle();if(a.error)throw a.error;if(!a.data)fail('당첨 혜택을 먼저 수령해 주세요.',403);
 const wallet=await db.from('customer_coupons').select('status').eq('id',a.data.wallet_id).eq('user_id',user.id).single();if(wallet.error)throw wallet.error;if(wallet.data.status==='revoked')fail('회수된 당첨 혜택입니다.',403);
 const item=(z.resources as EventResource[]).find(r=>r.id===params.get('file')&&r.published);
 if(!item||!eventFilePath(item.storagePath,slug,item.id))fail('자료를 찾을 수 없습니다.',404);
 const storage=db.storage.from('campus-event-assets'),info=await storage.info(item.storagePath);if(info.error||!info.data||typeof info.data.size!=='number'||info.data.size<1||info.data.size>LIBRARY_MAX_BYTES)fail('자료를 준비하지 못했습니다.',404);
 const signed=await storage.createSignedUrl(item.storagePath,60,{download:item.fileName});if(signed.error||!signed.data)throw signed.error||Error('download');
 await db.from('edu_event_actions').insert({zone_id:z.id,user_id:user.id,action:'download',target:item.id});
 return new Response(null,{status:303,headers:{Location:signed.data.signedUrl,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}catch(e){return problem(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)fail('요청 출처를 확인해 주세요.',403);
 const user=await getAuthenticatedUser();if(!user)fail('로그인이 필요합니다.',401);
 const b=await readSpaceJson(request,2000);if(typeof b.slug!=='string'||!['claim','live','detail'].includes(String(b.action)))fail('요청을 확인해 주세요.');
 const db=createAdminClient();
 if(b.action==='detail'){const z=await getEvent(b.slug);const a=await db.from('edu_event_awards').select('wallet_id').eq('zone_id',z.id).eq('user_id',user.id).maybeSingle();if(a.error)throw a.error;if(!a.data)fail('수령 권한이 없습니다.',403);await db.from('edu_event_actions').insert({zone_id:z.id,user_id:user.id,action:'detail'});return privateReply({ok:true});}
 const token=typeof b.invite==='string'&&invitePattern.test(b.invite)?b.invite:'';
 const r=await db.rpc('edu_event_claim',{p_user:user.id,p_slug:b.slug,p_hash:token?createHash('sha256').update(token).digest('hex'):'',p_live:b.action==='live'});if(r.error)eventError(r.error);
 return privateReply(await eventView(b.slug,user.id));
}catch(e){return problem(e);}}

export function HEAD(){return new Response(null,{status:405,headers:{Allow:"GET, POST","Cache-Control":"private, no-store"}});}
