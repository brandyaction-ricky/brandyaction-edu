import {notFound, redirect} from 'next/navigation';
import {LunarCampus} from '@/features/campus/tour/lunar-campus';
import {getAuthenticatedUser} from '@/lib/server-auth';
import {hasSupabaseEnv} from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';
export const metadata = {title: '달 풍경 캠퍼스', robots: {index: false, follow: false}};

export default async function StudyWalkPreview() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.NODE_ENV !== 'development') notFound();
  if (hasSupabaseEnv() && await getAuthenticatedUser()) redirect('/campus/enter');
  return <LunarCampus sample snapshot={{
    schemaVersion: 1, fetchedAt: new Date().toISOString(), viewer: {id: 'lunar-preview', displayName: '캠퍼스 방문자'},
    scopes: [], selectedEnrollmentId: null, lessons: [], links: {classes: '/my/classes', questions: '/my'},
    launchEligibility: null,
  }}/>;
}
