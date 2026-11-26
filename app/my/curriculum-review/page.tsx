import { notFound, redirect } from 'next/navigation';
import { isCampusId } from '@/features/campus/snapshot';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { canReviewCurriculum } from '@/lib/staff-curriculum-review';
import { StaffCurriculumReview } from '@/app/ui/final/staff-curriculum-review';
export const dynamic = 'force-dynamic';
export const metadata = { title: '커리큘럼 검수 | BrandyAction EDU', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ cohort?: string | string[] }> }) {
  const { cohort } = await searchParams;
  if (cohort !== undefined && (typeof cohort !== 'string' || !isCampusId(cohort))) notFound();
  const user = await getAuthenticatedUser();
  if (!user) {
    const next = '/my/curriculum-review' + (cohort ? '?cohort=' + cohort : '');
    redirect('/login?' + new URLSearchParams({ next }));
  }
  if (!canReviewCurriculum(user)) redirect('/my');
  return <main className="edu-front"><StaffCurriculumReview initialCohort={cohort} classroomCampus={process.env.EDU_CAMPUS_ENABLED === 'true' ? {} : undefined}/></main>;
}
