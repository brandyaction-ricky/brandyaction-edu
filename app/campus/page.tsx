import { notFound, redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { LearnerLive } from '@/features/campus/ui/live';
export const dynamic = 'force-dynamic';
export const metadata = {title:'나의 문샷 성장보드',robots:{index:false,follow:false}};
export default async function Page() {
  if(process.env.EDU_CAMPUS_ENABLED!=='true')notFound();
  if(!await getAuthenticatedUser())redirect('/login?next=%2Fcampus');
  return <LearnerLive/>;
}
