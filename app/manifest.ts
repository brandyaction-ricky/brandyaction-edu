import type { MetadataRoute } from 'next';
import { getPublicAppBranding } from '@/lib/app-branding-server';
export const dynamic = 'force-dynamic';
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getPublicAppBranding();
  return {
    id: '/', name: '브랜디에듀', short_name: '브랜디에듀', lang: 'ko',
    description: '배운 것을 내 일의 성과로. 나의 클래스와 실행 기록을 이어가세요.',
    start_url: '/my', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#c91c2d',
    icons: branding.icons,
  };
}
