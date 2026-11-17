import { campusAdminAccess, CampusAdminDenied, type PageQuery } from '@/features/campus/admin-page-access';
import { WebinarAdmin } from '@/features/campus/webinar/admin';

export const dynamic='force-dynamic';
export const metadata={title:'문샷 공개 웨비나 운영',robots:{index:false,follow:false}};
export default async function Page({ searchParams }: { searchParams: Promise<PageQuery> }) {
  const path = '/admin/campus/webinars';
  const operator = await campusAdminAccess(path, await searchParams);
  if (!operator) return <CampusAdminDenied path={path}/>;
  return <WebinarAdmin studyPreview={operator.permissions?.products}/>;
}
