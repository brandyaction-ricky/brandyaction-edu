import { redirect } from 'next/navigation';
import { StaffCurriculumReview } from '@/app/ui/final/staff-curriculum-review';
import { campusReturnPath, requestedEnrollment } from '@/features/campus/ui/navigation';
import { uuid } from '@/lib/edu-workflows';
import { externalPartnerUrl } from '@/lib/external-partner-url';
import { getAuthenticatedUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: '협력자 커리큘럼 | BrandyAction EDU', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ access?: string; lesson?: string; campusReturn?: string }> }) {
  const query = await searchParams;
  const access = uuid(query.access) ? query.access : undefined;
  const lesson = access && uuid(query.lesson) ? query.lesson : undefined;
  if (!await getAuthenticatedUser()) redirect('/login?next=' + encodeURIComponent(externalPartnerUrl(access, lesson)));
  const campus = campusReturnPath(query.campusReturn || null);
  const campusHref = campus && requestedEnrollment(campus.split('?')[1]) === access ? campus : undefined;
  return <main className="edu-front"><StaffCurriculumReview partner initialCohort={access} initialLesson={lesson} campusHref={campusHref}/></main>;
}
