import { AppInstallProvider } from './ui/final/app-install';
import { getPublicAppBranding } from '@/lib/app-branding-server';
import { getEduSettings } from '@/lib/edu-settings';
import { EDU_SEO_DEFAULT, EDU_SITE_NAME } from '@/lib/edu-seo';
import { LandingTestBanner } from './ui/landing/test-banner';
import './ui/landing/landing.css';
import { EventsTracker } from './ui/events-tracker';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './ui/final/tokens.css';
import './ui/final/frontend.css';
import './ui/final/admin.css';
import './ui/final/integration.css';
import './ui/final/product-editor.css';
import './ui/final/product-countdown.css';
import './ui/final/learning-editor.css';
// Keep the shared Admin contract last so legacy page CSS cannot override it.
import '@/features/admin-ui/styles/admin-system.css';
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicAppBranding();
  return {metadataBase:new URL('https://brandyaction-edu.com'),title:EDU_SEO_DEFAULT.title,description:EDU_SEO_DEFAULT.description,openGraph:{siteName:EDU_SITE_NAME,locale:'ko_KR',type:'website'},applicationName:'브랜디에듀',appleWebApp:{capable:true,title:'브랜디에듀',statusBarStyle:'default'},icons:{icon:branding.icon,apple:{url:branding.apple,sizes:'180x180',type:'image/png'}},robots: process.env.NEXT_PUBLIC_APP_ENV === 'production' ? undefined : {index:false,follow:false}};
}
async function Tracking() { const {operations}=await getEduSettings(); return <EventsTracker enabled={operations.trackingEnabled===true}/>; }
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="ko"><body><Suspense><LandingTestBanner /></Suspense><AppInstallProvider>{children}</AppInstallProvider><Suspense><Tracking /></Suspense></body></html>; }
