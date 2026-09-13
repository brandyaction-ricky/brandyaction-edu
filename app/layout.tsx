import { getEduSettings } from '@/lib/edu-settings';
import { LandingTestBanner } from './ui/landing/test-banner';
import './ui/landing/landing.css';
import { EventsTracker } from './ui/events-tracker';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import './ui/final/tokens.css';
import './ui/final/frontend.css';
import './ui/final/admin.css';
import './ui/final/integration.css';
import './ui/final/product-editor.css';
import './ui/final/learning-editor.css';
export const metadata: Metadata = {title:'BrandyAction EDU | 배운 것을, 내 일의 성과로.',description:'AI와 마케팅을 배우고 내 업무에 적용하는 실행 중심 교육.',robots: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? undefined : {index:false,follow:false}};
async function Tracking() { const {operations}=await getEduSettings(); return <EventsTracker enabled={operations.trackingEnabled===true}/>; }
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="ko"><body><Suspense><LandingTestBanner /></Suspense>{children}<Suspense><Tracking /></Suspense></body></html>; }
