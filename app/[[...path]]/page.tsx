import type { Metadata } from 'next';
import { getEduSettings } from '@/lib/edu-settings';
import { createClient } from '@/lib/supabase/server';
import { Platform } from '@/app/ui/platform';
import { notFound, redirect } from 'next/navigation';
import { metricsRedirect } from '@/lib/landing-admin-state';
import { sections } from '@/lib/platform';
import { headers } from 'next/headers';
import { productShareImage, sharingOrigin } from '@/lib/product-sharing';
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
  || (root === 'policies' && ['terms','privacy','refund'].includes(section) && path.length === 2);
 if (!valid) notFound();
 if (root === 'admin' && section === 'metrics') redirect(metricsRedirect(await searchParams));
 // The admin API verifies identity, account status and section permissions once.
 // Stream the admin shell immediately instead of repeating Auth + profile queries.
 // Platform loads the authenticated user and page data together from /api/platform.
 // Keeping it mounted across route changes preserves its in-memory state.
 return <Platform path={path} user={null}/>;
}

export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}):Promise<Metadata> {
 const {path=[]}=await params;
 if (path[0] === 'admin') return { title: '운영 관리 | BrandyAction EDU', robots: { index: false, follow: false } };
 const {seo}=await getEduSettings();
 let title=String(seo.title||'BrandyAction EDU | 배운 것을, 내 일의 성과로.');
 let description=String(seo.description||'AI와 마케팅을 배우고 내 업무에 적용하는 실행 중심 교육.');
 let unlisted=false;
 const origin=sharingOrigin((await headers()).get('host'));
 let shareImage=productShareImage({},origin,process.env.NEXT_PUBLIC_SUPABASE_URL||'');
 if(['classes','articles'].includes(path[0])&&path[1]) {
  const db=await createClient();
  const isCourse=path[0]==='classes';
  const {data}=await db.from(isCourse?'courses':'articles').select(isCourse?'title,summary,seo_title:metadata->>seo_title,seo_description:metadata->>seo_description,is_listed:metadata->is_listed,thumbnail_url:metadata->>thumbnail_url,thumbnailUrl:metadata->>thumbnailUrl':'title,summary').eq('slug',path[1]).eq('status','published').maybeSingle();
  if(data){
   const row=data as unknown as {title:string;summary?:string;seo_title?:string;seo_description?:string;is_listed?:boolean|string};
   unlisted=isCourse&&row.is_listed===false;
   title=(isCourse&&row.seo_title?.trim()?row.seo_title:row.title)+' | BrandyAction EDU';
   description=String((isCourse&&row.seo_description)||row.summary||description);
   if(isCourse) shareImage=productShareImage(data as unknown as Record<string,unknown>,origin,process.env.NEXT_PUBLIC_SUPABASE_URL||'');
  }
 }
 const privatePage=unlisted||['admin','my','learn','checkout','apply','payment','login','signup','auth'].includes(path[0]);
 return {title,description,openGraph:{title,description,images:[{url:shareImage,alt:title}]},twitter:{card:'summary_large_image',title,description,images:[shareImage]},robots:privatePage||process.env.NEXT_PUBLIC_APP_ENV!=='production'?{index:false,follow:false}:undefined,verification:{google:seo.googleVerification?String(seo.googleVerification):undefined,other:seo.naverVerification?{'naver-site-verification':String(seo.naverVerification)}:undefined}};
}
