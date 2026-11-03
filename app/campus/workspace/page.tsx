import {notFound,redirect} from 'next/navigation';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {FourSpacesLive} from '@/features/campus/tour/live';
import {getOperatorUser} from '@/lib/operator-permissions';
import {WorkspaceLive} from '@/features/campus/ui/workspace';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 캠퍼스 워크스페이스',robots:{index:false,follow:false}};
export default async function Page(){if(process.env.EDU_CAMPUS_ENABLED!=='true')notFound();const user=await getAuthenticatedUser();if(!user)redirect('/login?next=%2Fcampus%2Fworkspace');if(process.env.EDU_CAMPUS_TOUR_ENABLED==='true')return <FourSpacesLive operator={!!await getOperatorUser('members',user)}/>;return <WorkspaceLive/>;}
