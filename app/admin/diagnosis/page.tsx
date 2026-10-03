import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { DiagnosisExperience } from '@/app/ui/final/diagnosis-experience';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'N6 진단 받기 | BrandyAction EDU', robots: { index: false, follow: false } };
export default async function Page() {
  const user = await getAuthenticatedUser();
  if (!user) redirect('/login?next=%2Fadmin%2Fdiagnosis');
  if (user.role !== 'admin') notFound();
  if (process.env.EDU_MYIN_DIAGNOSIS_ENABLED !== 'true' || process.env.EDU_MYIN_DIAGNOSIS_SESSIONS_ENABLED !== 'true')
    return <main style={{ maxWidth: 640, margin: '80px auto', padding: 24 }}><h1>N6 진단 받기</h1><p>관리자 진단 연결을 준비하고 있습니다. 수강생에게는 공개되지 않습니다.</p><Link href="/admin">관리자 화면으로 돌아가기</Link></main>;
  return <DiagnosisExperience adminPilot exitHref="/admin" exitLabel="관리자 화면" reportsEnabled={process.env.EDU_MYIN_DIAGNOSIS_REPORTS_ENABLED === 'true'}/>;
}
