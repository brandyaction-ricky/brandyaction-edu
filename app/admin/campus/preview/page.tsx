import {notFound} from 'next/navigation';
import {campusUser} from '@/features/campus/entry-user';
import {getOperatorUser} from '@/lib/operator-permissions';
import {WebinarRoom} from '@/features/campus/webinar/room';
import {readWebinar} from '@/features/campus/webinar/server';
import {projectWebinar,type PublicWebinar} from '@/features/campus/webinar/domain';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 캠퍼스 · 관리자 미리보기',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{slug?:string}>}){const{slug}=await searchParams;const user=await campusUser('/admin/campus/preview',{slug});if(!await getOperatorUser('marketing',user))notFound();const configured=slug?await readWebinar(slug):null;const event:PublicWebinar=configured?projectWebinar(configured):{slug:'staff-preview',title:'문샷 캠퍼스 · 관리자 미리보기',description:'AI 마케팅을 배우고 실행하는 곳',startsAt:'2026-11-05T00:00:00Z',endsAt:'2026-11-05T01:00:00Z',detailPath:'/classes',kakaoUrl:'',youtubeId:'',checkoutPath:'/classes',resources:[]};if(configured)event.resources=(event.resources||[]).map(item=>({...item,url:configured.resources?.some(source=>source.id===item.id&&source.kind==='file'&&source.storagePath)?`/api/admin/campus/webinars/${event.slug}/resources/${item.id}`:item.url}));return <WebinarRoom event={event} demo operatorReview devReview={process.env.EDU_CAMPUS_VISITOR_QA_ENABLED==='true'&&process.env.NEXT_PUBLIC_SUPABASE_URL==='https://vjmjhaidlqkmascdjocw.supabase.co'}/>;}
