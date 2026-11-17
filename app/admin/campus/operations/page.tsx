import {notFound} from 'next/navigation';
import {getOperatorUser} from '@/lib/operator-permissions';
import {OperationsLive} from '@/features/campus/ui/operations';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 지원·운영 데스크',robots:{index:false,follow:false}};
export default async function Page(){if(process.env.EDU_CAMPUS_ENABLED!=='true'||!await getOperatorUser('members'))notFound();return <OperationsLive/>;}
