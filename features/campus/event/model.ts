import {fail,slugPattern,uuid} from '../webinar/domain';
import {libraryFileInput} from '../webinar/resource-files';
import type {CouponQuote} from '@/features/commerce/domain/coupon';
export type EventResource={id:string;title:string;description:string;fileName:string;storagePath:string;published:boolean};
export type EventSettings={slug:string;title:string;description:string;cohortId:string;claimEndsAt:string;couponEndsAt:string;enabled:boolean;resources:EventResource[]};
export type EventView={slug:string;title:string;description:string;claimed:boolean;claimEndsAt:string;couponEndsAt:string;liveEndsAt:string|null;liveOwned:boolean;liveAvailable:boolean;resources:Omit<EventResource,'storagePath'>[];quote:CouponQuote|null;detailPath:string;message?:string};
export const invitePattern=/^[a-f0-9]{64}$/;
export function eventPath(slug:string){return '/campus/event/'+slug;}
export function eventFilePath(path:unknown,slug:string,id:string){return typeof path==='string'&&path.startsWith(`edu/campus-event/${slug}/${id}/`)&&/^edu\/campus-event\/[a-z0-9-]+\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(pdf|zip|txt|csv|docx|xlsx|pptx|hwp)$/.test(path);}
export function eventSettings(value:unknown):EventSettings{
 if(!value||typeof value!=='object'||Array.isArray(value))fail('이벤트 설정을 확인해 주세요.');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['slug','title','description','cohortId','claimEndsAt','couponEndsAt','enabled','resources'].includes(k)))fail('알 수 없는 설정입니다.');
 if(typeof v.slug!=='string'||!slugPattern.test(v.slug)||!uuid(v.cohortId))fail('이벤트 주소와 교육 기수를 확인해 주세요.');
 if(typeof v.title!=='string'||!v.title.trim()||v.title.length>100||typeof v.description!=='string'||v.description.length>1200||typeof v.enabled!=='boolean')fail('제목과 안내 문구를 확인해 주세요.');
 const claim=Date.parse(String(v.claimEndsAt)),end=Date.parse(String(v.couponEndsAt));
 if(!Number.isFinite(claim)||!Number.isFinite(end)||claim>end)fail('수령 마감은 쿠폰 사용 마감 이전으로 설정해 주세요.');
 if(!Array.isArray(v.resources)||v.resources.length>12)fail('자료는 최대 12개까지 등록할 수 있습니다.');
 const ids=new Set();const resources=v.resources.map((r:EventResource)=>{
  if(!r||!uuid(r.id)||ids.has(r.id)||typeof r.title!=='string'||!r.title.trim()||r.title.length>100||typeof r.description!=='string'||r.description.length>240||typeof r.published!=='boolean'||!eventFilePath(r.storagePath,v.slug as string,r.id))fail('자료 제목과 업로드한 파일을 확인해 주세요.');
  libraryFileInput(r.fileName,1);ids.add(r.id);return{id:r.id,title:r.title.trim(),description:r.description.trim(),fileName:r.fileName,storagePath:r.storagePath,published:r.published};
 });
 return{slug:v.slug,title:v.title.trim(),description:v.description.trim(),cohortId:v.cohortId,claimEndsAt:new Date(claim).toISOString(),couponEndsAt:new Date(end).toISOString(),enabled:v.enabled,resources};
}
