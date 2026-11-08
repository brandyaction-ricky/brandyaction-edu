import { notFound } from 'next/navigation';
import { getOperatorUser } from '@/lib/operator-permissions';
import { campusUser } from '@/features/campus/entry-user';
import { WebinarAdmin } from '@/features/campus/webinar/admin';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 공개 웨비나 운영',robots:{index:false,follow:false}};
export default async function Page(){const user=await campusUser('/admin/campus/webinars');const operator=await getOperatorUser('marketing',user);if(!operator)notFound();return <WebinarAdmin studyPreview={operator.permissions.products}/>;}
