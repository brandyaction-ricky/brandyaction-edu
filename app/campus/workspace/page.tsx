import {notFound,redirect} from 'next/navigation';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {WorkspaceLive} from '@/features/campus/ui/workspace';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 캠퍼스 워크스페이스',robots:{index:false,follow:false}};
export default async function Page(){if(process.env.EDU_CAMPUS_ENABLED!=='true')notFound();if(!await getAuthenticatedUser())redirect('/login?next=%2Fcampus%2Fworkspace');return <WorkspaceLive/>;}
