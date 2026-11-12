import { Suspense } from 'react';
import { getAuthenticatedUser } from '@/lib/server-auth';
import { MemberVisitRecorder } from '@/app/ui/final/member-visit-recorder';
async function Visits() {
  const user=await getAuthenticatedUser();
  return user?.role==='student' ? <MemberVisitRecorder member={user.id}/> : null;
}
export default function CampusLayout({children}:{children:React.ReactNode}) {
  return <><Suspense fallback={null}><Visits/></Suspense>{children}</>;
}
