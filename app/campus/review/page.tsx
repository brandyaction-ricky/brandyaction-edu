import { notFound } from 'next/navigation';
import { PublicReview } from '@/features/campus/business/public-review';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 · 고객 테스트',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function ReviewPage(){if(process.env.EDU_CAMPUS_ENABLED!=='true'||process.env.EDU_CAMPUS_BUSINESS_ENABLED!=='true')notFound();return <PublicReview/>;}
