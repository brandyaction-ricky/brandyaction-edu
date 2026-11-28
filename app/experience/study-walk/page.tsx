import {notFound, redirect} from 'next/navigation';
import {DEFAULT_WELCOME} from '@/features/campus/welcome/content';
import {LunarCampus} from '@/features/campus/tour/lunar-campus';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {hasSupabaseEnv} from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
export const metadata = {title: '달 풍경 캠퍼스', robots: {index: false, follow: false}};

export default async function StudyWalkPreview() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') notFound();
  if (hasSupabaseEnv() && await getAuthenticatedUser()) redirect('/campus/enter');
  const sampleLesson = DEFAULT_WELCOME.lessons.find(item=>item.id==='ask-clearly');
  return <LunarCampus sample welcome={{settings:DEFAULT_WELCOME,resources:[{
    id:'ai-request-example',kind:'file',title:'AI 업무 요청 템플릿',description:'맡길 일과 결과를 확인할 기준을 한 장에 정리해 보세요.',
    url:'/uiux/assets/brandy-ai-request-sample.html',published:true,
  }]}} snapshot={{
    schemaVersion: 1, fetchedAt: new Date().toISOString(), viewer: {id: 'lunar-preview', displayName: '캠퍼스 방문자'},
    scopes: [], selectedEnrollmentId: null, lessons: sampleLesson?[{
      id:sampleLesson.id,title:sampleLesson.title,day:1,version:'preview',completed:false,href:'#lesson',missions:[],
    }]:[], links: {classes: '/my/classes', questions: '/my'},
    launchEligibility: null,
  }}/>;
}
