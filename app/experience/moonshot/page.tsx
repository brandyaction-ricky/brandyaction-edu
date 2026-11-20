import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import {ArrivalExperience} from '@/features/campus/arrival/experience';
import {arrivalIntroDescription, DEFAULT_ARRIVAL} from '@/features/campus/arrival/config';
import {arrivalLiveReminderEnabled, arrivalLiveReminderOpen} from '@/features/campus/arrival/live-reminder-server';
import {EDU_SITE_NAME} from '@/lib/edu-seo';
import {getOperatorUser} from '@/lib/operator-permissions';
import {readWebinar} from '@/features/campus/webinar/server';
import {slugPattern, uuid} from '@/features/campus/webinar/domain';
import {arrivalPublicationEnabled, arrivalRequiresPublication} from '@/features/campus/arrival/preview-gate';
import {readPublishedArrival} from '@/features/campus/arrival/publication-server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type PageProps = {searchParams: Promise<Record<string, string | string[] | undefined>>};
const robots = {index: false, follow: false};
const readPublicArrival = cache(() => arrivalPublicationEnabled(process.env) ? readPublishedArrival() : null);

export async function generateMetadata({searchParams}: PageProps): Promise<Metadata> {
  const {event} = await searchParams;
  if (event !== undefined) return {title: '문샷 체험 · 관리자 미리보기', robots};

  const publication = await readPublicArrival();
  if (!publication && arrivalRequiresPublication(process.env)) return {title: '문샷 AI 직원 체험', robots};

  const config = publication?.config ?? DEFAULT_ARRIVAL;
  const title = config.title.replace(/\s+/g, ' ').trim();
  const description = arrivalIntroDescription(config).replace(/\s+/g, ' ').trim();
  return {title, description, robots, openGraph: {title, description, siteName: EDU_SITE_NAME, locale: 'ko_KR', type: 'website'}};
}

export default async function Page({searchParams}: PageProps) {
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
  const publication = await readPublicArrival();
  if (!publication && arrivalRequiresPublication(process.env)) notFound();
  return <ArrivalExperience config={publication?.config ?? DEFAULT_ARRIVAL}
    liveReminderEnabled={arrivalLiveReminderEnabled() && arrivalLiveReminderOpen()}/>;
}
