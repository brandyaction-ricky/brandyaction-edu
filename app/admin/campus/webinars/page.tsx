import { notFound } from 'next/navigation';
import { getOperatorUser } from '@/lib/operator-permissions';
import { WebinarAdmin } from '@/features/campus/webinar/admin';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 공개 웨비나 운영',robots:{index:false,follow:false}};
export default async function Page(){if(!await getOperatorUser('marketing'))notFound();return <WebinarAdmin/>;}
