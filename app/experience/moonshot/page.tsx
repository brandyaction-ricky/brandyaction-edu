import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ArrivalExperience} from '@/features/campus/arrival/experience';
import {getOperatorUser} from '@/lib/operator-permissions';
import {readWebinar} from '@/features/campus/webinar/server';
import {slugPattern} from '@/features/campus/webinar/domain';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '내 일이 시작되는 곳 · 문샷 오픈 캠퍼스',
  description: '작은 일 하나를 AI에게 맡겨보세요. 문샷 캠퍼스에서 나에게 맞는 첫 결과를 만납니다.',
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
  return <ArrivalExperience/>;
}
