import {notFound} from 'next/navigation';
import {WebinarRoom} from '@/features/campus/webinar/room';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 오픈 캠퍼스 · DEV 직원 검수',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{crowd?:string}>}){
 if(process.env.EDU_CAMPUS_VISITOR_QA_ENABLED!=='true'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://vjmjhaidlqkmascdjocw.supabase.co')notFound();
 const {crowd}=await searchParams;
 return <WebinarRoom devReview qaCrowd={crowd==='60'} event={{slug:'dev-office-review',title:'AI와 함께, 내 일의 다음 도약',description:'직원용 DEV 공동 검수',startsAt:'2026-11-04T00:00:00Z',endsAt:'2026-11-11T00:00:00Z',detailPath:'https://brandyaction-edu.com/classes/product-b8e479a5-60f2-418a-892e-cc2720cd9326',checkoutPath:'https://brandyaction-edu.com/classes/product-b8e479a5-60f2-418a-892e-cc2720cd9326',kakaoUrl:'https://pf.kakao.com/_ydxjhxj/chat',youtubeId:''}}/>;
}
