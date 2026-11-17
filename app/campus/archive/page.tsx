import {notFound,redirect} from 'next/navigation';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {PersonalArchive} from '@/features/campus/business/archive-panel';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 개인 실행 보관함',robots:{index:false,follow:false}};
export default async function Page(){if(process.env.EDU_CAMPUS_ENABLED!=='true'||process.env.EDU_CAMPUS_BUSINESS_ENABLED!=='true')notFound();if(!await getAuthenticatedUser())redirect('/login?next=%2Fcampus%2Farchive');return <PersonalArchive/>;}
