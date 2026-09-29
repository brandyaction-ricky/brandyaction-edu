import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: '브랜디에듀', short_name: '브랜디에듀', lang: 'ko',
    description: '배운 것을 내 일의 성과로. 나의 클래스와 실행 기록을 이어가세요.',
    start_url: '/my', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#c91c2d',
    icons: [
      { src: '/icons/edu-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/edu-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/edu-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
