import {notFound, redirect} from 'next/navigation';
import {DEFAULT_WELCOME} from '@/features/campus/welcome/content';
import {LunarCampus} from '@/features/campus/tour/lunar-campus';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {hasSupabaseEnv} from '@/lib/supabase/config';

import type {CampusSnapshot} from '@/features/campus/contracts';
import {emptyOfficeDemo, mutateOfficeDemo, receiveOfficeDemo} from '@/features/campus/office/demo';

export const dynamic = 'force-dynamic';
export const metadata = {title: '달 풍경 캠퍼스', robots: {index: false, follow: false}};

export default async function StudyWalkPreview() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') notFound();
  if (hasSupabaseEnv() && await getAuthenticatedUser()) redirect('/campus/enter');
  const sampleLesson = DEFAULT_WELCOME.lessons.find(item=>item.id==='ask-clearly');
  const enrollmentId = '10000000-0000-4000-8000-000000000001';
  const snapshot: CampusSnapshot = {
    schemaVersion: 1, fetchedAt: new Date().toISOString(), viewer: {id: 'lunar-preview', displayName: '캠퍼스 방문자'},
    scopes: [{enrollmentId,courseId:'10000000-0000-4000-8000-000000000002',cohortId:'10000000-0000-4000-8000-000000000003',courseTitle:'문샷',cohortName:'캠퍼스 미리보기'}],
    selectedEnrollmentId: enrollmentId, lessons: sampleLesson?[{
      id:sampleLesson.id,title:sampleLesson.title,day:1,version:'preview',completed:false,href:'#lesson',missions:[],
    }]:[], links: {classes: '/my/classes', questions: '/my'},
    launchEligibility: null,
  };
  const jobId = '10000000-0000-4000-8000-000000000004';
  let officeExample = mutateOfficeDemo(emptyOfficeDemo(), {
    requestId:jobId, enrollmentId, action:'create', outputType:'copy', materialUrls:[],
    objective:'예약한 빵을 언제 찾을 수 있는지 묻는 고객에게 보낼 답장을 작성해 주세요.',
  }, snapshot, new Map());
  officeExample = receiveOfficeDemo(officeExample, {jobId,expectedRevision:1,event:'accepted'});
  officeExample = receiveOfficeDemo(officeExample, {jobId,expectedRevision:2,event:'started'});
  officeExample = receiveOfficeDemo(officeExample, {jobId,expectedRevision:3,event:'draft',
    draftText:'안녕하세요! 예약하신 빵은 오늘 오후 3시부터 6시까지 매장에서 찾으실 수 있어요. 예약자 성함을 말씀해 주시면 바로 챙겨드릴게요. 다른 시간에 오실 예정이라면 편한 시간을 알려주세요.',
  });
  const settings = {...DEFAULT_WELCOME, lessons: DEFAULT_WELCOME.lessons.map(item =>
    item.id === sampleLesson?.id
      ? {...item, url: '/uiux/assets/brandy-ai-request-sample.html', linkLabel: 'AI 업무 요청 템플릿 열기'}
      : item
  )};
  return <LunarCampus sample snapshot={snapshot} officeExample={officeExample} welcome={{settings,resources:[]}}/>;
}
