import {canReviewCampus,campusReviewPath} from '@/features/campus/operator-access';
import {notFound,redirect} from 'next/navigation';
import {campusUser} from '@/features/campus/entry-user';
import {FourSpacesLive} from '@/features/campus/tour/live';
import {getOperatorUser} from '@/lib/operator-permissions';
import {WorkspaceLive} from '@/features/campus/ui/workspace';
import {createClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
async function hasEnrollment(userId:string){const r=await (await createClient()).from('enrollments').select('id',{count:'exact',head:true}).eq('user_id',userId).eq('status','active').is('revoked_at',null);return !r.error&&(r.count||0)>0;}
export const metadata={title:'문샷 캠퍼스 워크스페이스',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{enrollmentId?:string;as?:string}>}){const q=await searchParams;if(process.env.EDU_CAMPUS_ENABLED!=='true')notFound();const user=await campusUser('/campus/workspace',q);const staff=canReviewCampus(user),asAdmin=staff&&q.as==='admin';if(staff&&!q.enrollmentId&&!(await hasEnrollment(user.id)))redirect(campusReviewPath());if(process.env.EDU_CAMPUS_TOUR_ENABLED==='true')return <FourSpacesLive studyPresence={process.env.EDU_CAMPUS_SPACE_ENABLED==='true'} modules={{focus:process.env.EDU_CAMPUS_FOCUS_ENABLED==='true',support:process.env.EDU_CAMPUS_SUPPORT_ENABLED==='true',community:process.env.EDU_CAMPUS_COMMUNITY_ENABLED==='true',business:process.env.EDU_CAMPUS_BUSINESS_ENABLED==='true'}} publicPresence={process.env.EDU_CAMPUS_VISITOR_QA_ENABLED==='true'&&process.env.NEXT_PUBLIC_SUPABASE_URL==='https://vjmjhaidlqkmascdjocw.supabase.co'} operator={(!staff||asAdmin)&&!!await getOperatorUser('members',user)}/>;return <WorkspaceLive/>;}
