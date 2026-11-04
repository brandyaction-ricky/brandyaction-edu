import {notFound} from 'next/navigation';
import {publicWebinar} from '@/features/campus/webinar/server';
import {WebinarRoom} from '@/features/campus/webinar/room';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 오픈 캠퍼스 · DEV 직원 검수',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{crowd?:string;event?:string}>}){
 if(process.env.EDU_CAMPUS_VISITOR_QA_ENABLED!=='true'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://vjmjhaidlqkmascdjocw.supabase.co')notFound();
 const {crowd,event:slug}=await searchParams;
 if(slug){const event=await publicWebinar(slug);if(!event)notFound();return <WebinarRoom devReview qaCrowd={crowd==='60'} event={event}/>;}
 return <WebinarRoom devReview qaCrowd={crowd==='60'} event={{slug:'dev-office-review',title:'AI와 함께, 내 일의 다음 도약',description:'직원용 DEV 공동 검수',startsAt:'2026-11-04T00:00:00Z',endsAt:'2026-11-11T00:00:00Z',detailPath:'/classes/product-b78c9952-a628-4501-b1de-61fb28c00e49',checkoutPath:'/classes/product-b78c9952-a628-4501-b1de-61fb28c00e49',kakaoUrl:'https://pf.kakao.com/_ydxjhxj/chat',youtubeId:''}}/>;
}
