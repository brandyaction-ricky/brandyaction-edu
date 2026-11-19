import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ARRIVAL_CALENDAR_FILE} from '@/features/campus/arrival/model';
import {ArrivalExperience} from '@/features/campus/arrival/experience';
import {arrivalLiveReminderEnabled, arrivalLiveReminderOpen} from '@/features/campus/arrival/live-reminder-server';
import {getOperatorUser} from '@/lib/operator-permissions';
import {readWebinar} from '@/features/campus/webinar/server';
import {slugPattern} from '@/features/campus/webinar/domain';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '혼자 하던 일, AI에게 맡길 수 있을까요? · 문샷',
  description: '회사 업무를 더 수월하게 하고 싶을 때도, 새로운 일을 준비할 때도. 내 상황에 맞는 AI 체험과 문샷 무료 라이브를 만나보세요.',
  robots: {index: false, follow: false},
};
export const dynamic = 'force-dynamic';

export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  // This recruitment journey is approved for branch preview only. Merging it
  // must not silently open a new public route on the production site.
  if (process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_APP_ENV === 'production') notFound();
  const {event} = await searchParams;
  if (event !== undefined) {
    if (typeof event !== 'string' || !slugPattern.test(event)) notFound();
    // Draft recruitment content is private. Never publish the enrolled-member
    // welcome settings, notices or curriculum through this anonymous preview.
    if (!await getOperatorUser('marketing')) return <main className="container section-pad"><h1>관리자 미리보기입니다.</h1><p>마케팅 운영 권한이 있는 계정으로 관리자 화면에서 열어주세요.</p><Link className="btn" href="/admin/campus/webinars">캠퍼스 관리로</Link></main>;
    const webinar = await readWebinar(event);
    if (!webinar?.arrival) notFound();
    return <ArrivalExperience config={webinar.arrival} persistenceKey={null} preview/>;
  }
  return <ArrivalExperience calendarFileHref={ARRIVAL_CALENDAR_FILE} liveReminderEnabled={arrivalLiveReminderEnabled() && arrivalLiveReminderOpen()}/>;
}
