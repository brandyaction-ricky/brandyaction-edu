import {createAdminClient} from '@/lib/supabase/admin';
import {couponError} from '@/lib/coupon-rules';
import {fail,slugPattern} from '../webinar/domain';
import type {EventResource,EventView} from './model';
import type {CouponQuote} from '@/features/commerce/domain/coupon';
export function eventError(e:{message:string}){const errors:Record<string,string>={EVENT_UNAVAILABLE:'지금은 입장할 수 없는 이벤트입니다.',EVENT_CLAIM_ENDED:'이벤트 혜택 수령 기간이 끝났습니다.',EVENT_INVITE_REQUIRED:'당첨자 전용 초대 링크로 입장해 주세요. 이미 다른 계정에서 받은 링크는 사용할 수 없습니다.',EVENT_CONFLICT:'다른 관리자가 수정했습니다. 새로고침 후 다시 저장해 주세요.',EVENT_LIVE_COUPON_REQUIRED:'쿠폰 관리에서 1108 코드를 30만원 정액 할인으로 준비해 주세요. 활성 상태여야 합니다.',EVENT_TARGET_IMMUTABLE:'저장한 이벤트의 교육 기수는 변경할 수 없습니다. 새 이벤트를 만들어 주세요.'};fail(errors[e.message]||(e.message.includes('COUPON_')?couponError(e.message):'이벤트를 처리하지 못했습니다. 다시 시도해 주세요.'),409);}
export async function getEvent(slug:string){if(!slugPattern.test(slug))fail('이벤트를 찾을 수 없습니다.',404);const r=await createAdminClient().from('edu_event_zones').select('*').eq('slug',slug).maybeSingle();if(r.error)throw r.error;if(!r.data)fail('이벤트를 찾을 수 없습니다.',404);return r.data;}
export async function ownedEventQuote(user:string,cohort:string):Promise<CouponQuote|null>{
 const r=await createAdminClient().rpc('edu_event_owned_quote',{p_user:user,p_cohort:cohort});if(r.error)throw r.error;return r.data as CouponQuote|null;
}

export async function eventView(slug:string,user:string|null):Promise<EventView>{
 const z=await getEvent(slug);if(!z.enabled)fail('지금은 입장할 수 없는 이벤트입니다.',404);
 const db=createAdminClient();const [c,h,a]=await Promise.all([db.from('coupons').select('id,ends_at').in('id',[z.live_coupon_id,z.bonus_coupon_id]),db.from('cohorts').select('courses(slug)').eq('id',z.cohort_id).single(),user?db.from('edu_event_awards').select('wallet_id').eq('zone_id',z.id).eq('user_id',user).maybeSingle():Promise.resolve({data:null,error:null})]);
 if(c.error||h.error||a.error)throw c.error||h.error||a.error;
 const course=h.data.courses as unknown as {slug:string};const claimed=Boolean(a.data);
 let walletExpiry:string|null=null;
 if(a.data){const w=await db.from('customer_coupons').select('status,expires_at').eq('id',a.data.wallet_id).eq('user_id',user!).single();if(w.error)throw w.error;if(w.data.status==='revoked')fail('회수된 당첨 혜택입니다. 운영진에게 문의해 주세요.',403);walletExpiry=w.data.expires_at;}
 let liveOwned=false,liveAvailable=false;
 if(user&&claimed){const w=await db.from('customer_coupons').select('id,status').eq('user_id',user).eq('coupon_id',z.live_coupon_id).maybeSingle();if(w.error)throw w.error;liveOwned=Boolean(w.data);const q=await db.rpc('edu_coupon_quote',{p_user:user,p_cohort:z.cohort_id,p_code:'1108'});if(q.error&&!q.error.message.includes('COUPON_'))throw q.error;liveAvailable=!q.error;}
 return{slug,sharedLink:z.shared_link===true,title:z.title,description:z.description,claimed,claimEndsAt:z.claim_ends_at,couponEndsAt:[walletExpiry,c.data.find(c=>c.id===z.bonus_coupon_id)?.ends_at].filter(Boolean).sort()[0],liveEndsAt:c.data.find(c=>c.id===z.live_coupon_id)?.ends_at||null,liveOwned,liveAvailable,resources:claimed?(z.resources as EventResource[]).filter(r=>r.published).map(r=>({id:r.id,title:r.title,description:r.description,fileName:r.fileName,published:r.published})):[],quote:user&&claimed?await ownedEventQuote(user,z.cohort_id):null,detailPath:'/classes/'+course.slug};
}
