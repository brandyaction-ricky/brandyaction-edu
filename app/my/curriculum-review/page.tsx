import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { canReviewCurriculum } from '@/lib/staff-curriculum-review';
import { StaffCurriculumReview } from '@/app/ui/final/staff-curriculum-review';
export const dynamic = 'force-dynamic';
export const metadata = { title: '커리큘럼 검수 | BrandyAction EDU', robots: { index: false, follow: false } };
export default async function Page() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/login?next=%2Fmy%2Fcurriculum-review');
  if (!canReviewCurriculum(user)) redirect('/my');
  return <main className="edu-front"><StaffCurriculumReview/></main>;
}
