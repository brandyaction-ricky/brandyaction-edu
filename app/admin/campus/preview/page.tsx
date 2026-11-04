import {notFound} from 'next/navigation';
import {getOperatorUser} from '@/lib/operator-permissions';
import {WebinarRoom} from '@/features/campus/webinar/room';
import {readWebinar} from '@/features/campus/webinar/server';
import {projectWebinar,type PublicWebinar} from '@/features/campus/webinar/domain';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 캠퍼스 · 관리자 미리보기',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{slug?:string}>}){if(!await getOperatorUser('marketing'))notFound();const{slug}=await searchParams;const configured=slug?await readWebinar(slug):null;const event:PublicWebinar=configured?projectWebinar(configured):{slug:'staff-preview',title:'문샷 캠퍼스 · 관리자 미리보기',description:'AI 마케팅을 배우고 실행하는 곳',startsAt:'2026-11-05T00:00:00Z',endsAt:'2026-11-05T01:00:00Z',detailPath:'/classes',kakaoUrl:'',youtubeId:'',checkoutPath:'/classes',resources:[]};if(configured)event.resources=(event.resources||[]).map(item=>({...item,url:configured.resources?.some(source=>source.id===item.id&&source.kind==='file'&&source.storagePath)?`/api/admin/campus/webinars/${event.slug}/resources/${item.id}`:item.url}));return <WebinarRoom event={event} demo/>;}
