import { notFound } from 'next/navigation';
import { getOperatorUser } from '@/lib/operator-permissions';
import { AdminLive } from '@/features/campus/ui/live';
export const dynamic = 'force-dynamic';
export const metadata = {title:'문샷 기수 운영 현황',robots:{index:false,follow:false}};
export default async function Page() {
  if(process.env.EDU_CAMPUS_ENABLED!=='true'||!await getOperatorUser('members'))notFound();
  return <AdminLive/>;
}
