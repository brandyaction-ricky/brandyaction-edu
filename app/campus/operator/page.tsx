import {readWelcome} from '@/features/campus/welcome/server';
import {notFound,redirect} from 'next/navigation';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {canReviewCampus} from '@/features/campus/operator-access';
import {FourSpacesPreview} from '@/features/campus/tour/preview';
import {isCampusId} from '@/features/campus/snapshot';
import {rooms,type TourRoom} from '@/features/campus/tour/model';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 캠퍼스 · 운영자 둘러보기',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(process.env.EDU_CAMPUS_ENABLED!=='true')notFound();
 const user=await getAuthenticatedUser();if(!user)redirect('/login?next=%2Fcampus%2Foperator');if(!canReviewCampus(user))notFound();
 const q=await searchParams;if(q.cohort!==undefined&&(typeof q.cohort!=='string'||!isCampusId(q.cohort)))notFound();
 const room=typeof q.room==='string'&&rooms.some(r=>r.id===q.room)?q.room as TourRoom:'study';
 const welcome=await readWelcome(typeof q.cohort==='string'?q.cohort:undefined);
 return <FourSpacesPreview welcome={welcome} review={{room}} snapshot={{schemaVersion:1,fetchedAt:new Date().toISOString(),viewer:{id:user.id,displayName:user.full_name||'운영자'},scopes:[],selectedEnrollmentId:null,lessons:[],links:{classes:'/admin',questions:'/admin'},launchEligibility:null}}/>;
}
