import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ArrivalExperience} from '@/features/campus/arrival/experience';

export const metadata: Metadata = {
  title: '내 일이 시작되는 곳 · 문샷 오픈 캠퍼스',
  description: '작은 일 하나를 AI에게 맡겨보세요. 문샷 캠퍼스에서 나에게 맞는 첫 결과를 만납니다.',
  robots: {index: false, follow: false},
};
export const dynamic = 'force-dynamic';

export default function Page() {
  // This recruitment journey is approved for branch preview only. Merging it
  // must not silently open a new public route on the production site.
  if (process.env.VERCEL_ENV === 'production' || process.env.NEXT_PUBLIC_APP_ENV === 'production') notFound();
  return <ArrivalExperience/>;
}
