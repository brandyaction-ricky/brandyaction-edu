import {notFound} from 'next/navigation';
import {getAdminUser} from '@/lib/server-auth';
import {readWebinar} from '@/features/campus/webinar/server';
import {projectWebinar,phase} from '@/features/campus/webinar/domain';
import {gatewayConfig} from '@/features/campus/webinar/realtime-admission';
import {WebinarRoom} from '@/features/campus/webinar/room';
export const dynamic='force-dynamic';
export const metadata={title:'실시간 연결 개발 검수',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{slug:string}>}) {
 const config=gatewayConfig(process.env);if(!config)notFound();
 const user=await getAdminUser();if(!user)notFound();
 const {slug}=await params;if(slug!==config.eventId)notFound();
 const event=await readWebinar(slug);if(!event||event.status!=='published'||phase(event)==='ended')notFound();
 return <><p role="status">개발 검수 · 실시간 게이트웨이 연결</p><WebinarRoom event={projectWebinar(event)} devReview realtimeReview collectActivity={false}/></>;
}
