import { diagnosisAudienceAllows } from '@/lib/diagnosis-audience';
import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { DiagnosisExperience } from '@/app/ui/final/diagnosis-experience';

export const dynamic = 'force-dynamic';
export const metadata = { title: '나를 이해하는 N6 검사 | BrandyAction EDU', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  if (process.env.EDU_MYIN_DIAGNOSIS_ENABLED !== 'true' || process.env.EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED !== 'true') notFound();
  const user = await getAuthenticatedUser();
  if (!user) redirect('/login?next=%2Fmy%2Fdiagnosis');
  if (!diagnosisAudienceAllows(user)) notFound();
  const query = await searchParams;
  return <DiagnosisExperience reportsEnabled={process.env.EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED === 'true'} initialCourseId={typeof query.course === 'string' ? query.course : undefined}/>;
}
