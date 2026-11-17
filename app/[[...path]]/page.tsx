import {campusPrivateRelease} from '@/features/campus/private-release';
import type { Metadata } from 'next';
import { cache } from 'react';
import { getEduSettings } from '@/lib/edu-settings';
import { EDU_SITE_NAME, seoText } from '@/lib/edu-seo';
import { createClient } from '@/lib/supabase/server';
import { Platform } from '@/app/ui/platform';
import { notFound, redirect } from 'next/navigation';
import { metricsRedirect } from '@/lib/landing-admin-state';
import { sections } from '@/lib/platform';
import { headers } from 'next/headers';
import { productShareImage, sharingOrigin } from '@/lib/product-sharing';
import { isPolicyPath } from '@/lib/legal-policies';
import { catalogTitle } from '@/lib/course-catalog';
export const dynamic = 'force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{path?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const {path=[]} = await params;
 const [root, section] = path;
 const valid = path.length === 0
  || (['login','signup','stories','checkout','apply','applied','order-complete'].includes(root) && path.length === 1)
  || (['classes','articles'].includes(root) && path.length <= 2)
  || (root === 'my' && path.length <= 2 && (!section || ['classes','missions','questions','messages','resources','reviews','orders','coupons','profile'].includes(section)))
  || (root === 'admin' && path.length <= 2 && (!section || ['product-editor','learning-editor'].includes(section) || sections.some(item => item.key === section)))
  || (root === 'learn' && path.length >= 2 && (path.length <= 3 || (path.length === 4 && path[3] === 'mission')))
  || (root === 'payment' && ['success','fail'].includes(section) && path.length === 2)
  || isPolicyPath(path);
 if (!valid) notFound();
 // Old bookmarks can still point to the login form with a campus destination.
 if (root === 'login') {
  const { next } = await searchParams;
  if (typeof next === 'string') {
   const { campusLoginReturn } = await import('@/lib/oauth-callback');
   const destination = campusLoginReturn(next);
   if (destination) {
    const { getAuthenticatedUser } = await import('@/lib/server-auth');
    if (await getAuthenticatedUser()) redirect(destination);
   }
  }
 }
 if (root === 'admin' && section === 'metrics') redirect(metricsRedirect(await searchParams));
 // The admin API verifies identity, account status and section permissions once.
 // Stream the admin shell immediately instead of repeating Auth + profile queries.
 // Platform loads the authenticated user and page data together from /api/platform.
 // Keeping it mounted across route changes preserves its in-memory state.
 const LessonFocus = root==='learn'&&process.env.EDU_CAMPUS_ENABLED==='true'&&!campusPrivateRelease()&&process.env.EDU_CAMPUS_SPACE_ENABLED==='true' ? (await import('@/features/campus/space/lesson-focus')).LessonFocus : null;
 // While the campus is private, only someone who came from inside it (a valid return address) is shown the way back.
 const campusPage=process.env.EDU_CAMPUS_ENABLED==='true'&&['my','learn'].includes(root),campusBack=campusPage?(await searchParams)?.campusReturn:undefined;
 const campusPrivate=campusPage&&campusPrivateRelease();
 const CampusEntryBar=campusPage&&(!campusPrivate||(typeof campusBack==='string'&&campusBack.startsWith('/campus/workspace?')))?(await import('@/features/campus/ui/entry-bar')).CampusEntryBar:null;
 const returnTo=CampusEntryBar?campusBack:undefined;
 // Crawlers read the server HTML: give public pages their name and summary before the client loads the rest.
 const item=['classes','articles'].includes(root)&&section?await publicItem(root,section):null;
 const ld=path.length===0?jsonLd([{'@context':'https://schema.org','@type':'WebSite',name:EDU_SITE_NAME,alternateName:brand.alternateName,url:SITE_URL+'/'},{'@context':'https://schema.org',...brand}])
  :item&&!item.unlisted&&root==='classes'?jsonLd({'@context':'https://schema.org','@type':'Course',name:item.title,description:item.description||item.title,url:`${SITE_URL}/classes/${section}`,provider:brand}):null;
 const platform=item||ld?<>{ld}<Platform path={path} user={null} preview={item?{title:item.title,summary:item.description}:undefined}/></>:<Platform path={path} user={null}/>;
 if (!path.length && (await import('@/lib/home-consultation-enabled')).homeConsultationEnabled()) {
  const { PublicHomeConsultation } = await import('@/app/ui/final/home-consultation');
  return <>{platform}<PublicHomeConsultation /></>;
 }
 return CampusEntryBar||LessonFocus?<>{CampusEntryBar&&<CampusEntryBar returnTo={typeof returnTo==='string'?returnTo:undefined} backOnly={campusPrivate}/>}{platform}{LessonFocus&&<LessonFocus/>}</>:platform;
}

// Search titles per public section (CEO 11-09: 브랜디에듀 · AI 마케팅 · AI 자동화).
const SECTION_SEO: Record<string, [string, string]> = {
 classes: ['AI 마케팅·AI 자동화 클래스', '브랜디에듀의 AI 마케팅·AI 자동화 클래스를 한곳에서 확인하세요. 무료 클래스부터 실전 과정까지, 지금 막힌 일에 맞춰 고를 수 있습니다.'],
 articles: ['AI 마케팅·AI 자동화 인사이트', 'AI로 마케팅과 반복 업무를 바꾸는 방법을 브랜디에듀가 정리합니다.'],
 stories: ['고객 이야기', '브랜디에듀에서 배운 AI 마케팅·AI 자동화를 자기 일에 적용한 수강생들의 이야기입니다.'],
};
const SITE_URL = 'https://brandyaction-edu.com';
// One read per request for both the metadata and the page body (React cache).
const publicItem = cache(async (kind: string, slug: string) => {
 const isCourse = kind === 'classes';
 const {data} = await (await createClient()).from(isCourse?'courses':'articles').select(isCourse?'title,summary,seo_title:metadata->>seo_title,seo_description:metadata->>seo_description,is_listed:metadata->is_listed,thumbnail_url:metadata->>thumbnail_url,thumbnailUrl:metadata->>thumbnailUrl':'title,summary').eq('slug',slug).eq('status','published').maybeSingle();
 if (!data) return null;
 const row = data as unknown as {title:string;summary?:string;seo_title?:string;seo_description?:string;is_listed?:boolean|string};
 return {
  row: data as unknown as Record<string, unknown>,
  title: isCourse ? catalogTitle({id: slug, title: row.seo_title?.trim() || row.title}) : row.title,
  description: String((isCourse && row.seo_description) || row.summary || ''),
  unlisted: isCourse && row.is_listed === false,
 };
});
const jsonLd = (value: unknown) => <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(value).replace(/</g, '\\u003c')}}/>;
const brand = {'@type': 'EducationalOrganization', name: EDU_SITE_NAME, alternateName: ['BrandyAction EDU', '브랜디액션 에듀'], url: SITE_URL + '/'};

export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata> {
 const {path=[]}=await params;
 if (path[0] === 'admin') return { title: '운영 관리 | BrandyAction EDU', robots: { index: false, follow: false } };
 const {seo}=await getEduSettings();
 let title=seoText(seo,'title');
 let description=seoText(seo,'description');
 let unlisted=false;
 const origin=sharingOrigin((await headers()).get('host'));
 let shareImage=productShareImage({},origin,process.env.NEXT_PUBLIC_SUPABASE_URL||'');
 const section=path.length===1?SECTION_SEO[path[0]]:undefined;
 if(section) { title=`${section[0]} | ${EDU_SITE_NAME}`; description=section[1]; }
 if(['classes','articles'].includes(path[0])&&path[1]) {
  const item=await publicItem(path[0],path[1]);
  if(item){
   unlisted=item.unlisted;
   title=`${item.title} | ${EDU_SITE_NAME}`;
   description=item.description||description;
   if(path[0]==='classes') shareImage=productShareImage(item.row,origin,process.env.NEXT_PUBLIC_SUPABASE_URL||'');
  }
 }
 const privatePage=unlisted||['admin','my','learn','checkout','apply','payment','login','signup','auth'].includes(path[0]);
 // Query strings (ad tags, filters) point back to the plain address.
 const url='/'+path.join('/');
 return {title,description,alternates:privatePage?undefined:{canonical:url},openGraph:{title,description,url,siteName:EDU_SITE_NAME,locale:'ko_KR',type:'website',images:[{url:shareImage,alt:title}]},twitter:{card:'summary_large_image',title,description,images:[shareImage]},robots:privatePage||process.env.NEXT_PUBLIC_APP_ENV!=='production'?{index:false,follow:false}:undefined,verification:{google:seo.googleVerification?String(seo.googleVerification):undefined,other:seo.naverVerification?{'naver-site-verification':String(seo.naverVerification)}:undefined}};
}
