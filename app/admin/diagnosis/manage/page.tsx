import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { DiagnosisManagement } from '@/app/ui/final/diagnosis-management';
import { Platform } from '@/app/ui/platform';
export const dynamic='force-dynamic';
export const metadata={title:'N6 진단 관리 | BrandyAction EDU',robots:{index:false,follow:false}};
export default async function Page(){
  const user=await getAuthenticatedUser();if(!user)redirect('/login?next=%2Fadmin%2Fdiagnosis%2Fmanage');if(user.role!=='admin')notFound();
  return <Platform path={['admin','diagnosis','manage']} user={user} adminContent={<DiagnosisManagement/>}/>;
}
