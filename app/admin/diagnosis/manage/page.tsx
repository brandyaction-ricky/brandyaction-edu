import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { DiagnosisManagement } from '@/app/ui/final/diagnosis-management';
export const dynamic='force-dynamic';
export const metadata={title:'N6 진단 관리 | BrandyAction EDU',robots:{index:false,follow:false}};
export default async function Page(){
  const user=await getAuthenticatedUser();if(!user)redirect('/login?next=%2Fadmin%2Fdiagnosis%2Fmanage');if(user.role!=='admin')notFound();
  return <main className="edu-admin" style={{maxWidth:1280,margin:'0 auto',padding:'clamp(16px,4vw,48px)'}}><DiagnosisManagement/></main>;
}
