import {getOperatorUser} from '@/lib/operator-permissions';
import {readWebinar} from '@/features/campus/webinar/server';
import {readWelcome} from '@/features/campus/welcome/server';
import {notFound} from 'next/navigation';
import {campusUser} from '@/features/campus/entry-user';
import {canReviewCampus} from '@/features/campus/operator-access';
import {FourSpacesPreview} from '@/features/campus/tour/preview';
import {isCampusId} from '@/features/campus/snapshot';
import {rooms,type TourRoom} from '@/features/campus/tour/model';
export const dynamic='force-dynamic';
export const metadata={title:'문샷 캠퍼스 · 운영자 둘러보기',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(process.env.EDU_CAMPUS_ENABLED!=='true')notFound();
 const q=await searchParams;const user=await campusUser('/campus/operator',q);if(!canReviewCampus(user))notFound();
 if(q.cohort!==undefined&&(typeof q.cohort!=='string'||!isCampusId(q.cohort)))notFound();
 const room=typeof q.room==='string'&&rooms.some(r=>r.id===q.room)?q.room as TourRoom:'study';
 const event=typeof q.event==='string'?await readWebinar(q.event):null;
 const welcome=await readWelcome(typeof q.cohort==='string'?q.cohort:event?.cohortId);
 return <FourSpacesPreview welcome={welcome} review={{room,studyPreview:!!await getOperatorUser('products',user)}} snapshot={{schemaVersion:1,fetchedAt:new Date().toISOString(),viewer:{id:user.id,displayName:user.full_name||'운영자'},scopes:[],selectedEnrollmentId:null,lessons:[],links:{classes:'/admin',questions:'/admin'},launchEligibility:null}}/>;
}
