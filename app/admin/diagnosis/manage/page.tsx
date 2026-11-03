import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { DiagnosisManagement } from '@/app/ui/final/diagnosis-management';
import { uuid } from '@/lib/edu-workflows';
import { Platform } from '@/app/ui/platform';
export const dynamic='force-dynamic';
export const metadata={title:'N6 진단 관리 | BrandyAction EDU',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{member?:string}>}){
  const {member}=await searchParams;if(member!==undefined&&!uuid(member))notFound();
  const next='/admin/diagnosis/manage'+(member?'?member='+encodeURIComponent(member):'');
  const user=await getAuthenticatedUser();if(!user)redirect('/login?next='+encodeURIComponent(next));if(user.role!=='admin')notFound();
  return <Platform path={['admin','diagnosis','manage']} user={user} adminContent={<DiagnosisManagement member={member}/>}/>;
}
