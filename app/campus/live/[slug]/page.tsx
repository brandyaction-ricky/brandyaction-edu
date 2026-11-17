import { notFound } from 'next/navigation';
import { publicWebinar } from '@/features/campus/webinar/server';
import { WebinarRoom } from '@/features/campus/webinar/room';
export const revalidate=30;
export function generateStaticParams(){return [];}
export const metadata={title:'문샷 라이브 캠퍼스',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;const event=await publicWebinar(slug);if(!event)notFound();
 return <WebinarRoom event={event} devReview={process.env.EDU_CAMPUS_VISITOR_QA_ENABLED==='true'&&process.env.NEXT_PUBLIC_SUPABASE_URL==='https://vjmjhaidlqkmascdjocw.supabase.co'}/>;
}
