import { notFound } from 'next/navigation';
import { campusAdminAccess, CampusAdminDenied, type PageQuery } from '@/features/campus/admin-page-access';
import { AdminLive } from '@/features/campus/ui/live';

export const dynamic = 'force-dynamic';
export const metadata = {title:'문샷 기수 운영 현황',robots:{index:false,follow:false}};
export default async function Page({ searchParams }: { searchParams: Promise<PageQuery> }) {
  if (process.env.EDU_CAMPUS_ENABLED !== 'true') notFound();
  const path = '/admin/campus';
  const operator = await campusAdminAccess(path, await searchParams);
  if (!operator) return <CampusAdminDenied path={path}/>;
  return <AdminLive studySettings={operator.permissions?.products}/>;
}
