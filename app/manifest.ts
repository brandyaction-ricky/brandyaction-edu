import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { id: '/', name: '브랜디에듀', short_name: '브랜디에듀', lang: 'ko', start_url: '/my', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#c91c2d', icons: [{ src: '/apple-icon', sizes: '512x512', type: 'image/png', purpose: 'any' }] };
}
