import {notFound} from 'next/navigation';
import {getOperatorUser} from '@/lib/operator-permissions';
import {EventAdmin} from '@/features/campus/event/admin';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 당첨자 이벤트 관리',robots:{index:false,follow:false}};
export default async function Page(){if(!await getOperatorUser('marketing'))notFound();return <EventAdmin/>;}
