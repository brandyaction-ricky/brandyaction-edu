import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ArrivalExperience} from '@/features/campus/arrival/experience';
import {DEFAULT_ARRIVAL} from '@/features/campus/arrival/config';
import {arrivalLiveReminderEnabled, arrivalLiveReminderOpen} from '@/features/campus/arrival/live-reminder-server';
import {getOperatorUser} from '@/lib/operator-permissions';
import {readWebinar} from '@/features/campus/webinar/server';
import {slugPattern, uuid} from '@/features/campus/webinar/domain';
import {arrivalPreviewClosed, arrivalPublicationEnabled} from '@/features/campus/arrival/preview-gate';
import {readPublishedArrival} from '@/features/campus/arrival/publication-server';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '문샷 AI 직원 체험 · 혼자 하던 일, AI에게 맡길 수 있을까요?',
  description: '회사 업무를 더 수월하게 하고 싶을 때도, 새로운 일을 준비할 때도. 내 상황에 맞는 AI 체험과 문샷 무료 라이브를 만나보세요.',
  robots: {index: false, follow: false},
};
export const dynamic = 'force-dynamic';

export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  if (arrivalPreviewClosed(process.env)) notFound();
  const {event, revision} = await searchParams;
  if (event !== undefined) {
    if (typeof event !== 'string' || !slugPattern.test(event) || (revision !== undefined && !uuid(revision))) notFound();
    if (!await getOperatorUser('marketing')) return <main className="container section-pad"><h1>관리자 미리보기입니다.</h1><p>마케팅 운영 권한이 있는 계정으로 관리자 화면에서 열어주세요.</p><Link className="btn" href="/admin/campus/webinars">캠퍼스 관리로</Link></main>;
    const webinar = await readWebinar(event);
    if (!webinar?.arrival) notFound();
    if (revision !== undefined && webinar.revision !== revision) {
      return <main className="container section-pad"><h1>저장된 설정이 바뀌었어요.</h1><p>관리자 화면에서 최신 설정을 다시 열어 주세요.</p><Link className="btn" href="/admin/campus/webinars">캠퍼스 관리로</Link></main>;
    }
    return <ArrivalExperience config={webinar.arrival} persistenceKey={null} preview/>;
  }
  const publication = arrivalPublicationEnabled(process.env) ? await readPublishedArrival() : null;
  return <ArrivalExperience config={publication?.config ?? DEFAULT_ARRIVAL}
    liveReminderEnabled={arrivalLiveReminderEnabled() && arrivalLiveReminderOpen()}/>;
}
